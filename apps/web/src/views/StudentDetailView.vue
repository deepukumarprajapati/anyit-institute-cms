<template>
  <div v-if="loading && !profile" style="padding: 48px; text-align: center">
    <a-spin size="large" />
  </div>
  <div v-else-if="!profile && !loading">
    <a-result status="404" title="Student not found">
      <template #extra>
        <a-button type="primary" @click="router.push('/students')">Back to students</a-button>
      </template>
    </a-result>
  </div>
  <div v-else-if="profile" class="profile-page">
    <a-spin :spinning="refreshing">
    <div class="page-header">
      <a-space>
        <a-button @click="router.push('/students')">← Back</a-button>
        <div>
          <h1 style="margin: 0">{{ fullName }}</h1>
          <p style="margin: 4px 0 0">
            {{ profile.student.admissionNo }}
            <a-tag style="margin-left: 8px">{{ profile.student.status }}</a-tag>
            <span v-if="classLabel" class="muted"> · {{ classLabel }}</span>
          </p>
        </div>
      </a-space>
      <a-space>
        <RouterLink
          v-if="auth.can('students.update')"
          :to="`/students/${profile.student._id}/edit`"
        >
          <a-button>Edit details</a-button>
        </RouterLink>
        <a-select
          v-model:value="selectedSessionId"
          style="min-width: 220px"
          placeholder="Academic year"
          :options="sessionOptions"
        />
      </a-space>
    </div>

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :lg="8">
        <a-card title="Profile">
          <div class="avatar-wrap">
            <a-avatar :size="96" :src="profile.student.photoUrl || undefined">
              {{ initials }}
            </a-avatar>
            <a-upload
              v-if="auth.can('students.update')"
              :show-upload-list="false"
              :custom-request="uploadPhoto"
              accept="image/*"
            >
              <a-button size="small" style="margin-top: 8px">Upload photo</a-button>
            </a-upload>
          </div>
          <a-descriptions :column="1" size="small" bordered style="margin-top: 16px">
            <a-descriptions-item label="Campus">
              {{ campusName }}
              <a-button
                v-if="auth.can('students.update')"
                size="small"
                type="link"
                @click="transferOpen = true"
              >
                Transfer branch
              </a-button>
            </a-descriptions-item>
            <a-descriptions-item label="Admission">{{ profile.student.admissionNo }}</a-descriptions-item>
            <a-descriptions-item label="Gender">{{ profile.student.gender || '—' }}</a-descriptions-item>
            <a-descriptions-item label="DOB">
              {{ profile.student.dob ? dayjs(profile.student.dob).format('DD MMM YYYY') : '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="Phone">{{ profile.student.phone || '—' }}</a-descriptions-item>
            <a-descriptions-item label="Email">{{ profile.student.email || '—' }}</a-descriptions-item>
            <a-descriptions-item label="Address">{{ profile.student.address || '—' }}</a-descriptions-item>
            <a-descriptions-item label="Transport">
              <div v-if="profile.transport">
                <div>
                  {{ profile.transport.routeName || 'Route' }} · {{ profile.transport.stopName }}
                </div>
                <div v-if="profile.transport.monthlyFee" class="muted" style="font-size: 12px">
                  Fee: ₹{{ Number(profile.transport.monthlyFee).toLocaleString('en-IN') }}/mo
                  <span v-if="profile.transport.feeTierName">
                    ({{ profile.transport.feeTierName }}
                    <span v-if="profile.transport.maxKm"> · ≤{{ profile.transport.maxKm }} km</span>)
                  </span>
                </div>
              </div>
              <span v-else>—</span>
              <div v-if="auth.can('transport.manage') || auth.can('fees.manage')" style="margin-top: 6px">
                <a-button size="small" type="link" style="padding: 0" @click="openTransportAssign">
                  {{ profile.transport ? 'Change transport fee' : 'Assign transport + fee' }}
                </a-button>
              </div>
            </a-descriptions-item>
          </a-descriptions>

          <a-divider>Guardians</a-divider>
          <a-list
            size="small"
            :data-source="profile.student.guardians || []"
            :locale="{ emptyText: 'No guardians on file' }"
          >
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta
                  :title="`${item.name} (${item.relation})`"
                  :description="[item.phone, item.email].filter(Boolean).join(' · ') || '—'"
                />
              </a-list-item>
            </template>
          </a-list>

          <a-divider>Enrollment history (by academic year)</a-divider>
          <p class="muted" style="font-size: 12px; margin-bottom: 8px">
            Each row is one academic session. Changing class for the current year only updates that
            year’s row — previous years stay as history.
          </p>
          <a-table
            size="small"
            :pagination="false"
            row-key="_id"
            :data-source="profile.enrollments || []"
            :columns="enrollmentColumns"
          />

          <StudentCampusHistory :history="profile.student.campusHistory || []" />
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="16">
        <a-alert
          v-if="!yearData"
          type="info"
          show-icon
          message="No academic year history available for this student yet."
          style="margin-bottom: 16px"
        />

        <template v-if="yearData">
          <a-row :gutter="[12, 12]" style="margin-bottom: 16px">
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <template v-if="feeYearClosed">
                  <a-statistic title="Fee pending" :value="0" prefix="₹" />
                  <div class="muted" style="font-size: 12px; margin-top: 4px">
                    Year closed on promotion
                  </div>
                </template>
                <template v-else-if="feeAdvancePaid > 0 && feeLatestBalance <= 0">
                  <a-statistic
                    title="Advance paid"
                    :value="feeAdvancePaid"
                    prefix="₹"
                    :value-style="{ color: '#389e0d' }"
                  />
                  <div class="muted" style="font-size: 12px; margin-top: 4px">
                    Credit on account (no dues)
                  </div>
                </template>
                <template v-else>
                  <a-statistic title="Fee pending" :value="feeLatestBalance" prefix="₹" />
                  <div class="muted" style="font-size: 12px; margin-top: 4px">
                    <template v-if="feeAdvancePaid > 0">
                      Also advance ₹{{ feeAdvancePaid.toLocaleString('en-IN') }}
                    </template>
                    <template v-else>Latest month balance (carry-forward)</template>
                  </div>
                </template>
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Months pending" :value="yearData.fees?.summary.monthsPendingCount || 0" />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Attendance" :value="yearData.attendance.percentage" suffix="%" />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Open complaints" :value="openComplaints" />
              </a-card>
            </a-col>
          </a-row>

          <a-tabs v-model:activeKey="sectionTab">
            <a-tab-pane key="fees" tab="Fees (month-wise)">
              <div class="fees-toolbar">
                <a-space wrap>
                  <a-button type="primary" ghost :loading="itrLoading" @click="downloadItrStatement(false)">
                    Download FY statement (ITR) till today
                  </a-button>
                  <a-button :loading="itrLoading" @click="previewItrStatement">
                    Preview FY statement
                  </a-button>
                  <a-button
                    v-if="auth.can('fees.manage') || auth.can('fees.collect')"
                    type="primary"
                    @click="openStudentInvoiceCreate"
                  >
                    Create invoice
                  </a-button>
                  <a-button
                    v-if="auth.can('fees.manage') || auth.can('fees.collect')"
                    @click="openOtherFeeCreate"
                  >
                    Add other fee
                  </a-button>
                </a-space>
                <span class="muted" style="font-size: 12px">
                  Indian FY Apr–Mar · payments recorded till today for ITR reference
                </span>
              </div>

              <a-alert
                v-if="feeYearClosed"
                type="success"
                show-icon
                style="margin-bottom: 12px"
                message="This academic year is closed"
                :description="
                  feeClosedPendingHint
                    ? `Student moved to the current year, so prior-year dues are not carried as pending${feeClosedPendingHint}. Billing history below is for reference only.`
                    : 'Student moved to the current year, so prior-year fees are treated as closed. Billing history below is for reference only.'
                "
              />
              <a-alert
                v-if="feeAdvancePaid > 0 && !feeYearClosed"
                type="success"
                show-icon
                style="margin-bottom: 12px"
                :message="`Advance paid ₹${feeAdvancePaid.toLocaleString('en-IN')}`"
                :description="'No pending dues. Further Save as Paid amounts are kept as advance credit on this student.'"
              />
              <a-alert
                v-if="!feeYearClosed"
                type="info"
                show-icon
                style="margin-bottom: 12px"
                :message="`Outstanding balance ₹${feeLatestBalance.toLocaleString('en-IN')}`"
                :description="
                  feeFullySettled
                    ? 'Full payment received. Earlier months still show what was due (in green). The payment month and overall balance are ₹0.'
                    : 'Balance = previous month’s balance + this month’s due. Each month keeps its own Month due. After full payment, earlier dues stay visible in green; the payment month balance is ₹0.'
                "
              />

              <a-card
                v-if="(yearData.fees?.advancePayments || []).length"
                size="small"
                title="Advance payments"
                style="margin-bottom: 12px"
              >
                <a-table
                  size="small"
                  row-key="_id"
                  :pagination="false"
                  :data-source="yearData.fees.advancePayments"
                  :columns="advancePaymentColumns"
                />
              </a-card>

              <a-card
                v-if="otherFeesByMonth.length || auth.can('fees.manage') || auth.can('fees.collect')"
                size="small"
                title="Other fees"
                style="margin-bottom: 12px"
              >
                <a-table
                  size="small"
                  row-key="month"
                  :pagination="false"
                  :data-source="otherFeesByMonth"
                  :columns="otherFeeMonthColumns"
                >
                  <!-- Pay button hidden for now — pay only via Fees → Create invoice
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'pay'">
                      <a-button
                        v-if="canCollectFees"
                        size="small"
                        type="primary"
                        :disabled="Number(record.pendingAmount) <= 0"
                        @click.stop="openOtherFeesMonthPay(record)"
                      >
                        Pay
                      </a-button>
                    </template>
                  </template>
                  -->
                  <template #expandedRowRender="{ record }">
                    <a-table
                      size="small"
                      row-key="_id"
                      :pagination="false"
                      :data-source="record.items"
                      :columns="otherFeeDetailColumns"
                    >
                      <template #bodyCell="{ column, record: item }">
                        <template v-if="column.key === 'actions'">
                          <a-space v-if="auth.can('fees.manage') || auth.can('fees.collect')">
                            <a-button size="small" type="link" @click="openOtherFeeEdit(item)">
                              Edit
                            </a-button>
                            <a-popconfirm
                              v-if="auth.can('fees.manage')"
                              title="Remove this other fee?"
                              ok-text="Remove"
                              ok-type="danger"
                              @confirm="removeOtherFee(item._id)"
                            >
                              <a-button size="small" type="link" danger>Remove</a-button>
                            </a-popconfirm>
                          </a-space>
                        </template>
                      </template>
                    </a-table>
                  </template>
                </a-table>
                <a-empty
                  v-if="!otherFeesByMonth.length"
                  description="No other fees yet"
                  :image-style="{ height: '48px' }"
                />
              </a-card>

              <a-table
                size="small"
                row-key="month"
                :pagination="false"
                :data-source="feeMonthsSorted"
                :columns="feeMonthColumns"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'month'">
                    {{ formatFeeMonth(record.month) }}
                  </template>
                  <template v-else-if="column.key === 'prevDue'">
                    <span
                      :class="{
                        muted: !Number(record.prevDue),
                        'fee-settled': record.showSettled && Number(record.prevDue) > 0,
                      }"
                    >
                      ₹{{ Number(record.prevDue || 0).toLocaleString('en-IN') }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'monthDue'">
                    <span
                      :class="{
                        muted: !Number(record.monthDue),
                        'fee-settled': record.showSettled && Number(record.monthDue) > 0,
                      }"
                    >
                      ₹{{ Number(record.monthDue || 0).toLocaleString('en-IN') }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'balance'">
                    <strong
                      :class="{
                        muted: !Number(record.balance),
                        'fee-settled': record.showSettled && Number(record.balance) > 0,
                      }"
                      :style="{
                        color:
                          Number(record.balance) > 0 && !record.showSettled
                            ? '#cf1322'
                            : undefined,
                      }"
                    >
                      ₹{{ Number(record.balance || 0).toLocaleString('en-IN') }}
                    </strong>
                  </template>
                  <!-- Pay button hidden for now — pay only via Fees → Create invoice
                  <template v-else-if="column.key === 'pay'">
                    <a-button
                      v-if="canCollectFees"
                      size="small"
                      type="primary"
                      :disabled="Number(record.pendingAmount) <= 0"
                      @click.stop="openMonthPay(record)"
                    >
                      Pay
                    </a-button>
                  </template>
                  -->
                  <template v-else-if="column.key === 'actions'">
                    <a-space
                      v-if="Number(record.paidAmount) > 0 || Number(record.paymentsReceived) > 0"
                    >
                      <a-button size="small" type="link" @click="previewMonthReceipt(record.month)">
                        Preview PDF
                      </a-button>
                      <a-button size="small" type="link" @click="downloadMonthReceipt(record.month)">
                        Download
                      </a-button>
                    </a-space>
                    <span v-else class="muted">—</span>
                  </template>
                </template>
                <template #expandedRowRender="{ record }">
                  <div
                    v-if="Number(record.prevDue) > 0 || record.showSettled"
                    class="muted"
                    style="margin-bottom: 8px"
                  >
                    <template v-if="record.showSettled && Number(record.balance) > 0">
                      Settled — was previous ₹{{ Number(record.prevDue).toLocaleString('en-IN') }}
                      + month due ₹{{ Number(record.monthDue).toLocaleString('en-IN') }}
                      = ₹{{ Number(record.balance).toLocaleString('en-IN') }}
                    </template>
                    <template v-else-if="Number(record.prevDue) > 0">
                      Includes previous balance ₹{{ Number(record.prevDue).toLocaleString('en-IN') }}
                      + this month’s due ₹{{ Number(record.monthDue).toLocaleString('en-IN') }}
                      = balance ₹{{ Number(record.balance).toLocaleString('en-IN') }}
                    </template>
                  </div>
                  <a-collapse ghost>
                    <a-collapse-panel key="breakdown" header="Fee breakdown (heads)">
                      <a-space wrap>
                        <a-tag v-for="(amt, cat) in record.byCategory" :key="cat" color="orange">
                          {{ categoryLabel(String(cat)) }}: ₹{{ Number(amt).toLocaleString('en-IN') }}
                        </a-tag>
                        <span v-if="!Object.keys(record.byCategory || {}).length" class="muted">
                          No pending fee heads
                        </span>
                      </a-space>
                    </a-collapse-panel>
                    <a-collapse-panel
                      key="payments"
                      :header="`Payments received this month${
                        (record.payments || []).length
                          ? ` · ₹${Number(record.paymentsReceived || 0).toLocaleString('en-IN')}`
                          : ''
                      }`"
                    >
                      <a-table
                        size="small"
                        :pagination="false"
                        :data-source="record.payments || []"
                        row-key="_id"
                        :locale="{ emptyText: 'No payments received in this month' }"
                        :columns="[
                          { title: 'Receipt', dataIndex: 'receiptNo' },
                          {
                            title: 'Paid on',
                            customRender: ({ record: r }: any) =>
                              r.paidAt ? dayjs(r.paidAt).format('DD MMM YYYY') : '—',
                          },
                          {
                            title: 'Amount',
                            customRender: ({ record: r }: any) =>
                              `₹${Number(r.amount).toLocaleString('en-IN')}`,
                          },
                          { title: 'Mode', dataIndex: 'method' },
                          {
                            title: 'Toward',
                            customRender: ({ record: r }: any) =>
                              r.kind === 'advance'
                                ? 'Advance'
                                : r.invoiceNo || '—',
                          },
                        ]"
                      />
                    </a-collapse-panel>
                    <a-collapse-panel key="invoices" header="Invoices this month">
                      <a-table
                        size="small"
                        :pagination="false"
                        :data-source="record.invoices || []"
                        row-key="_id"
                        :locale="{ emptyText: 'No invoices' }"
                        :columns="[
                          { title: 'Invoice', dataIndex: 'invoiceNo' },
                          { title: 'Status', dataIndex: 'status' },
                          {
                            title: 'Billed',
                            customRender: ({ record: r }: any) =>
                              `₹${Number(r.totalAmount).toLocaleString('en-IN')}`,
                          },
                          {
                            title: 'Paid',
                            customRender: ({ record: r }: any) =>
                              `₹${Number(r.paidAmount).toLocaleString('en-IN')}`,
                          },
                          {
                            title: 'Pending',
                            customRender: ({ record: r }: any) =>
                              `₹${Number(r.pendingAmount).toLocaleString('en-IN')}`,
                          },
                        ]"
                      />
                    </a-collapse-panel>
                  </a-collapse>
                </template>
                <template #summary>
                  <a-table-summary fixed>
                    <a-table-summary-row>
                      <!-- expand column spacer — without this, totals shift under Paid -->
                      <a-table-summary-cell :index="0" />
                      <a-table-summary-cell :index="1"><strong>Total</strong></a-table-summary-cell>
                      <a-table-summary-cell :index="2">
                        <strong>₹{{ feeMonthsBilledTotal.toLocaleString('en-IN') }}</strong>
                      </a-table-summary-cell>
                      <a-table-summary-cell :index="3">
                        <strong>₹{{ feeMonthsPaidTotal.toLocaleString('en-IN') }}</strong>
                      </a-table-summary-cell>
                      <a-table-summary-cell :index="4" />
                      <a-table-summary-cell :index="5">
                        <strong :class="{ 'fee-settled': feeFullySettled && feePendingTotal > 0 }">
                          ₹{{ feePendingTotal.toLocaleString('en-IN') }}
                        </strong>
                      </a-table-summary-cell>
                      <a-table-summary-cell :index="6">
                        <strong
                          :style="{
                            color: feeLatestBalance > 0 ? '#cf1322' : undefined,
                          }"
                          :class="{ muted: feeLatestBalance === 0 }"
                        >
                          ₹{{ feeLatestBalance.toLocaleString('en-IN') }}
                        </strong>
                      </a-table-summary-cell>
                      <a-table-summary-cell :index="7" />
                    </a-table-summary-row>
                  </a-table-summary>
                </template>
              </a-table>
              <a-empty v-if="!(yearData.fees?.byMonth || []).length" description="No fee records" />
            </a-tab-pane>

            <a-tab-pane key="complaints" tab="Complaints">
              <a-table
                size="small"
                row-key="_id"
                :data-source="yearData.complaints"
                :columns="complaintColumns"
                :pagination="{ pageSize: 6 }"
              />
            </a-tab-pane>

            <a-tab-pane key="events" tab="Events & participation">
              <a-table
                size="small"
                row-key="_id"
                :data-source="yearData.eventParticipations"
                :columns="eventColumns"
                :pagination="{ pageSize: 6 }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'event'">
                    <RouterLink v-if="record.eventId" :to="`/events/${record.eventId}`">
                      {{ record.eventTitle }}
                    </RouterLink>
                    <span v-else>{{ record.eventTitle }}</span>
                  </template>
                </template>
              </a-table>
            </a-tab-pane>

            <a-tab-pane key="event-photos" tab="Event photos">
              <p class="muted" style="margin-top: 0">
                Photos from events this student participated in
                <span v-if="selectedYear?.session?.name"> ({{ selectedYear.session.name }})</span>.
                Click a photo to open the slider.
              </p>
              <a-radio-group v-model:value="photoScope" size="small" style="margin-bottom: 12px">
                <a-radio-button value="year">This year</a-radio-button>
                <a-radio-button value="all">All years</a-radio-button>
              </a-radio-group>

              <a-empty
                v-if="!studentEventPhotos.length"
                description="No event photos yet"
              />
              <div v-else class="event-photo-groups">
                <div
                  v-for="group in eventPhotoGroups"
                  :key="group.eventId"
                  class="event-photo-group"
                >
                  <div class="group-title">
                    <RouterLink v-if="group.eventId" :to="`/events/${group.eventId}`">
                      {{ group.eventTitle }}
                    </RouterLink>
                    <span v-else>{{ group.eventTitle }}</span>
                    <span v-if="group.eventDate" class="muted">
                      · {{ dayjs(group.eventDate).format('DD MMM YYYY') }}
                    </span>
                  </div>
                  <div class="photo-grid">
                    <button
                      v-for="(photo, idx) in group.photos"
                      :key="photo.key"
                      type="button"
                      class="photo-tile"
                      @click="openEventLightbox(group.photos, idx)"
                    >
                      <img :src="photo.url" :alt="photo.caption || group.eventTitle" />
                    </button>
                  </div>
                </div>
              </div>
            </a-tab-pane>

            <a-tab-pane key="attendance" tab="Attendance history">
              <p class="muted" style="margin-bottom: 8px">
                {{ yearData.attendance.present }}/{{ yearData.attendance.total }} present
                ({{ yearData.attendance.percentage }}%)
              </p>
              <a-table
                size="small"
                row-key="_id"
                :data-source="yearData.attendance.items"
                :columns="[
                  {
                    title: 'Date',
                    customRender: ({ record }: any) => dayjs(record.date).format('DD MMM YYYY'),
                  },
                  { title: 'Status', dataIndex: 'status' },
                  { title: 'Remark', dataIndex: 'remark' },
                ]"
                :pagination="{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'] }"
              />
            </a-tab-pane>

            <a-tab-pane key="marks" tab="Marks & results">
              <a-table
                size="small"
                row-key="_id"
                :data-source="yearData.marks"
                :columns="marksColumns"
                :pagination="{ pageSize: 8 }"
              />
            </a-tab-pane>

            <a-tab-pane key="units" tab="Unit tests">
              <a-table
                size="small"
                row-key="_id"
                :data-source="yearData.unitTests"
                :columns="unitColumns"
                :pagination="{ pageSize: 8 }"
              />
            </a-tab-pane>

            <a-tab-pane key="medical" tab="Medical history">
              <a-timeline v-if="yearData.medical.length">
                <a-timeline-item v-for="m in yearData.medical" :key="m._id">
                  <strong>{{ dayjs(m.recordDate).format('DD MMM YYYY') }}</strong>
                  <div v-if="m.bloodGroup">Blood group: {{ m.bloodGroup }}</div>
                  <div v-if="m.heightCm || m.weightKg">
                    {{ m.heightCm ? `${m.heightCm} cm` : '' }}
                    {{ m.weightKg ? ` · ${m.weightKg} kg` : '' }}
                  </div>
                  <div v-if="m.allergies?.length">Allergies: {{ m.allergies.join(', ') }}</div>
                  <div v-if="m.conditions?.length">Conditions: {{ m.conditions.join(', ') }}</div>
                  <div v-if="m.medications?.length">Medications: {{ m.medications.join(', ') }}</div>
                  <div v-if="m.notes">{{ m.notes }}</div>
                  <div v-if="m.doctorName" class="muted">Dr. {{ m.doctorName }}</div>
                </a-timeline-item>
              </a-timeline>
              <a-empty v-else description="No medical records" />
            </a-tab-pane>
          </a-tabs>
        </template>
      </a-col>
    </a-row>

    <a-modal
      v-model:open="previewOpen"
      :title="previewTitle"
      width="900px"
      :footer="null"
      destroy-on-close
      @cancel="closePreview"
    >
      <a-spin :spinning="previewLoading">
        <div class="preview-toolbar">
          <a-space>
            <a-button type="primary" :disabled="!previewUrl" @click="downloadFromPreview">
              Download PDF
            </a-button>
            <a-button :disabled="!previewUrl" @click="openPreviewInTab">Open in new tab</a-button>
          </a-space>
        </div>
        <iframe
          v-if="previewUrl"
          class="receipt-frame"
          :src="previewUrl"
          title="Fee PDF preview"
        />
        <a-empty v-else-if="!previewLoading" description="Unable to load preview" />
      </a-spin>
    </a-modal>

    <a-modal
      v-model:open="lightboxOpen"
      :title="lightboxTitle"
      :footer="null"
      width="920px"
      centered
      destroy-on-close
      @after-open-change="onLightboxOpenChange"
    >
      <div class="lightbox-body">
        <a-carousel
          ref="carouselRef"
          arrows
          dots
          class="photo-slider"
          :key="lightboxKey"
          @after-change="onSlideChange"
        >
          <div v-for="photo in lightboxPhotos" :key="photo.key" class="slide">
            <div class="slide-inner">
              <img :src="photo.url" :alt="photo.caption || lightboxTitle" />
            </div>
          </div>
        </a-carousel>
        <div class="lightbox-meta">
          {{ activeSlide + 1 }} / {{ lightboxPhotos.length }}
          <span v-if="lightboxPhotos[activeSlide]?.eventTitle" class="muted">
            · {{ lightboxPhotos[activeSlide].eventTitle }}
          </span>
        </div>
      </div>
    </a-modal>
    <DraggableDialog
      v-model:open="studentInvoiceOpen"
      title="Create invoice"
      storage-key="create-invoice"
    >
      <p class="muted" style="margin-top: 0">
        Student is filled from this profile. Drag empty space on the dialog to move it (position is kept).
        <strong>Save as Paid</strong> clears existing month dues (oldest first). If nothing is due,
        the amount is recorded as advance paid.
        <strong>Save as Pending</strong> adds a new charge.
      </p>
      <a-form layout="vertical">
        <a-form-item label="Student">
          <a-input :value="studentInvoice.studentLabel" disabled />
        </a-form-item>
        <a-form-item label="Academic year">
          <a-input :value="studentInvoice.sessionLabel" disabled />
        </a-form-item>
        <a-form-item label="Billing month" required>
          <a-date-picker
            v-model:value="studentInvoice.billingMonth"
            picker="month"
            style="width: 100%"
            format="MMM YYYY"
          />
        </a-form-item>
        <a-form-item label="Total amount (₹)" required>
          <a-input-number v-model:value="studentInvoice.amount" :min="1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Description" required>
          <a-textarea
            v-model:value="studentInvoice.description"
            :rows="3"
            placeholder="What is this invoice for?"
            :maxlength="500"
            show-count
          />
        </a-form-item>
        <a-form-item label="Payment method">
          <a-select
            v-model:value="studentInvoice.method"
            style="width: 100%"
            :options="['cash', 'upi', 'card', 'bank', 'other'].map((v) => ({ label: v.toUpperCase(), value: v }))"
          />
        </a-form-item>
        <a-space style="width: 100%; justify-content: flex-end" wrap>
          <a-button @click="studentInvoiceOpen = false">Cancel</a-button>
          <a-button :loading="studentInvoiceSaving" @click="submitStudentInvoice('pending')">
            Save as Pending
          </a-button>
          <a-button type="primary" :loading="studentInvoiceSaving" @click="submitStudentInvoice('paid')">
            Save as Paid
          </a-button>
        </a-space>
      </a-form>
    </DraggableDialog>

    <a-modal
      v-model:open="chargeOpen"
      :title="chargeForm.invoiceId ? 'Edit other fee' : 'Add other fee'"
      :confirm-loading="chargeSaving"
      :footer="null"
      destroy-on-close
    >
      <p class="muted" style="margin-top: 0">
        Other fee for this student only. Choose month, then Pending (adds to dues) or Paid (recorded as collected).
      </p>
      <a-form layout="vertical">
        <a-form-item label="Title" required>
          <a-input v-model:value="chargeForm.title" placeholder="e.g. Library fine / Late fee" />
        </a-form-item>
        <a-form-item label="Description">
          <a-textarea
            v-model:value="chargeForm.description"
            :rows="3"
            placeholder="Add details — reason, reference, notes…"
            :maxlength="500"
            show-count
          />
        </a-form-item>
        <a-form-item label="Month" required>
          <a-date-picker
            v-model:value="chargeForm.billingMonth"
            picker="month"
            style="width: 100%"
            format="MMM YYYY"
          />
        </a-form-item>
        <a-form-item label="Amount (₹)" required>
          <a-input-number v-model:value="chargeForm.amount" :min="1" style="width: 100%" />
        </a-form-item>
        <a-space style="width: 100%; justify-content: flex-end" wrap>
          <a-button @click="chargeOpen = false">Cancel</a-button>
          <a-button :loading="chargeSaving" @click="submitCharge('pending')">
            Save as Pending
          </a-button>
          <a-button type="primary" :loading="chargeSaving" @click="submitCharge('paid')">
            Save as Paid
          </a-button>
        </a-space>
      </a-form>
    </a-modal>

    <!-- Month pay modal hidden for now — pay only via Fees → Create invoice
    <a-modal
      v-model:open="monthPayOpen"
      title="Pay full month"
      ok-text="Collect payment"
      :confirm-loading="monthPaySaving"
      :ok-button-props="{ disabled: !canCollectFees }"
      destroy-on-close
      @ok="submitMonthPay"
    >
      ...
    </a-modal>
    -->

    <a-modal
      v-model:open="transportOpen"
      title="Assign transport + distance fee"
      :confirm-loading="transportSaving"
      ok-text="Save"
      @ok="saveTransport"
      destroy-on-close
    >
      <p class="muted" style="margin-top: 0">
        Transport fee is for this student only (not the whole class). Pick route, stop, and distance slab.
      </p>
      <a-form layout="vertical">
        <a-form-item label="Route" required>
          <a-select
            v-model:value="transportForm.routeId"
            :options="routeOptions"
            placeholder="Select route"
            style="width: 100%"
            @change="onRouteChange"
          />
        </a-form-item>
        <a-form-item label="Stop" required>
          <a-select
            v-model:value="transportForm.stopName"
            :options="stopOptions"
            placeholder="Select stop"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="Distance fee slab" required>
          <a-select
            v-model:value="transportForm.feeTierId"
            :options="tierOptions"
            placeholder="e.g. Up to 5 km"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <TransferCampusModal
      v-if="profile.student._id"
      v-model:open="transferOpen"
      :student-id="profile.student._id"
      @transferred="load({ silent: true })"
    />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs, { Dayjs } from 'dayjs';
import { message } from 'ant-design-vue';
import { FEE_CATEGORY_LABELS, type FeeCategory } from '@anyit/shared';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import DraggableDialog from '@/components/DraggableDialog.vue';
import StudentCampusHistory from '@/features/campus/components/StudentCampusHistory.vue';
import TransferCampusModal from '@/features/campus/components/TransferCampusModal.vue';
import { campusDisplayName } from '@/features/campus/types';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const refreshing = ref(false);
const profile = ref<any>(null);
const selectedSessionId = ref<string | undefined>(undefined);
const sectionTab = ref('fees');

const canCollectFees = computed(() => auth.can('fees.collect') || auth.can('fees.manage'));

const fullName = computed(() => {
  const s = profile.value?.student;
  if (!s) return '';
  return `${s.firstName || ''} ${s.lastName || ''}`.trim();
});

const initials = computed(() => {
  const s = profile.value?.student;
  if (!s) return '?';
  return `${(s.firstName || '?')[0]}${(s.lastName || ' ')[0]}`.toUpperCase();
});

const sessionOptions = computed(() =>
  (profile.value?.years || []).map((y: { sessionId: string; session: { name: string }; isActive?: boolean }) => ({
    value: y.sessionId,
    label: `${y.session?.name || 'Session'}${y.isActive ? ' (current)' : ' (closed)'}`,
  }))
);

const selectedYear = computed(() => {
  const years = profile.value?.years || [];
  if (!years.length) return null;
  return years.find((y: { sessionId: string }) => y.sessionId === selectedSessionId.value) || years[0];
});

const campusName = computed(() => campusDisplayName(profile.value?.student?.campusId));

const transferOpen = ref(false);

const classLabel = computed(() => {
  const e = selectedYear.value?.enrollment;
  if (!e) return '';
  const cls = e.classId?.name || '';
  const sec = e.sectionId?.name || '';
  return [cls, sec ? `Sec ${sec}` : ''].filter(Boolean).join(' · ');
});

const yearData = computed(() => selectedYear.value || null);

/**
 * Month due as of month-end: billed minus payments dated on/before that month.
 * Later catch-up payments (e.g. Aug settling Apr) do not erase Apr’s historical due.
 */
function feeMonthEndPending(m: {
  month: string;
  totalAmount?: number;
  ledgerPayments?: { amount?: number; paidAt?: string | Date }[];
  payments?: { amount?: number; paidAt?: string | Date }[];
}) {
  const end = dayjs(`${m.month}-01`).endOf('month');
  // Prefer payments against this month’s invoices (not cash received in the month)
  const source = m.ledgerPayments?.length ? m.ledgerPayments : m.payments || [];
  const paidByEnd = source.reduce((s, p) => {
    if (!p.paidAt || dayjs(p.paidAt).isAfter(end)) return s;
    return s + Number(p.amount || 0);
  }, 0);
  return Math.max(0, Math.round((Number(m.totalAmount || 0) - paidByEnd) * 100) / 100);
}

/**
 * Chronological ledger with carry-forward.
 * While dues remain: live pendingAmount.
 * After full payment: earlier months keep historical Month due / Prev. due / Balance (green);
 * the payment (latest) month shows ₹0; overall outstanding is ₹0.
 */
const feeMonthsSorted = computed(() => {
  const rows = [...(yearData.value?.fees?.byMonth || [])]
    .filter(
      (m: { totalAmount?: number; pendingAmount?: number; payments?: unknown[] }) =>
        Number(m.totalAmount) > 0 ||
        Number(m.pendingAmount) > 0 ||
        (Array.isArray(m.payments) && m.payments.length > 0),
    )
    .sort((a: { month: string }, b: { month: string }) =>
      String(a.month).localeCompare(String(b.month)),
    );

  const livePending = rows.reduce(
    (s: number, m: { pendingAmount?: number }) => s + Number(m.pendingAmount || 0),
    0,
  );
  const fullySettled = rows.length > 0 && Math.round(livePending * 100) / 100 <= 0;

  let prevBalance = 0;
  const withCarry = rows.map(
    (
      m: {
        pendingAmount?: number;
        month: string;
        totalAmount?: number;
        payments?: { amount?: number; paidAt?: string | Date }[];
      },
      index: number,
    ) => {
      const isLatest = index === rows.length - 1;
      const liveDue = Math.max(0, Math.round(Number(m.pendingAmount || 0) * 100) / 100);
      const histDue = feeMonthEndPending(m);

      // After full settlement: keep historical dues on earlier months; zero the payment month.
      const monthDue = fullySettled ? (isLatest ? 0 : histDue) : liveDue;
      const prevDue = fullySettled && isLatest ? 0 : prevBalance;
      const balance = fullySettled && isLatest ? 0 : Math.round((prevDue + monthDue) * 100) / 100;

      // Advance historical/live running balance for the next row (use hist when settled).
      if (fullySettled) {
        prevBalance = Math.round((prevBalance + histDue) * 100) / 100;
      } else {
        prevBalance = balance;
      }

      return {
        ...m,
        monthDue,
        prevDue,
        balance,
        showSettled: fullySettled && !isLatest && (monthDue > 0 || prevDue > 0 || balance > 0),
      };
    },
  );

  return withCarry.reverse();
});

const feeFullySettled = computed(() => {
  const rows = yearData.value?.fees?.byMonth || [];
  if (!rows.length) return false;
  const live = rows.reduce(
    (s: number, m: { pendingAmount?: number }) => s + Number(m.pendingAmount || 0),
    0,
  );
  return Math.round(live * 100) / 100 <= 0;
});

/** Sum of displayed Month due (historical when settled, excluding payment-month zeros). */
const feePendingTotal = computed(() => {
  const sum = feeMonthsSorted.value.reduce(
    (s: number, m: { monthDue?: number }) => s + Number(m.monthDue || 0),
    0,
  );
  return Math.round(sum * 100) / 100;
});

/** True outstanding — 0 after full payment even if earlier rows still show historical dues. */
const feeLatestBalance = computed(() => {
  const rows = yearData.value?.fees?.byMonth || [];
  const sum = rows.reduce(
    (s: number, m: { pendingAmount?: number }) => s + Number(m.pendingAmount || 0),
    0,
  );
  return Math.round(sum * 100) / 100;
});

const feeAdvancePaid = computed(() =>
  Math.round(Number(yearData.value?.fees?.summary?.advancePaid || 0) * 100) / 100,
);

const feeYearClosed = computed(() => Boolean(yearData.value?.fees?.summary?.yearClosed));

const feeClosedPendingHint = computed(() => {
  const n = Number(yearData.value?.fees?.summary?.closedPendingAmount || 0);
  if (n <= 0) return '';
  return ` (was ₹${n.toLocaleString('en-IN')} in demo data)`;
});

const advancePaymentColumns = [
  { title: 'Invoice', dataIndex: 'invoiceNo' },
  {
    title: 'Month',
    customRender: ({ record }: { record: { billingMonth: string } }) =>
      formatFeeMonth(record.billingMonth),
  },
  {
    title: 'Amount',
    customRender: ({ record }: { record: { amount: number } }) =>
      `₹${Number(record.amount).toLocaleString('en-IN')}`,
  },
  {
    title: 'Paid on',
    customRender: ({ record }: { record: { paidAt?: string } }) =>
      record.paidAt ? dayjs(record.paidAt).format('DD MMM YYYY') : '—',
  },
  { title: 'Note', dataIndex: 'description', ellipsis: true },
];

const feeMonthsBilledTotal = computed(() => {
  const sum = feeMonthsSorted.value.reduce(
    (s: number, m: { totalAmount?: number }) => s + Number(m.totalAmount || 0),
    0,
  );
  return Math.round(sum * 100) / 100;
});

const feeMonthsPaidTotal = computed(() => {
  const sum = feeMonthsSorted.value.reduce(
    (s: number, m: { paidAmount?: number }) => s + Number(m.paidAmount || 0),
    0,
  );
  return Math.round(sum * 100) / 100;
});

type EventPhotoItem = {
  key: string;
  _id: string;
  url: string;
  caption?: string;
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  role?: string;
};

const photoScope = ref<'year' | 'all'>('all');

const studentEventPhotos = computed<EventPhotoItem[]>(() => {
  const years =
    photoScope.value === 'year'
      ? selectedYear.value
        ? [selectedYear.value]
        : []
      : profile.value?.years || [];
  const seen = new Set<string>();
  const out: EventPhotoItem[] = [];
  for (const y of years) {
    for (const p of y.eventPhotos || []) {
      const key = `${p.eventId}-${p._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        _id: String(p._id),
        url: p.url,
        caption: p.caption,
        eventId: String(p.eventId),
        eventTitle: p.eventTitle || 'Event',
        eventDate: p.eventDate,
        role: p.role,
      });
    }
  }
  return out;
});

const eventPhotoGroups = computed(() => {
  const map = new Map<
    string,
    { eventId: string; eventTitle: string; eventDate?: string; photos: EventPhotoItem[] }
  >();
  for (const photo of studentEventPhotos.value) {
    const id = photo.eventId || photo.eventTitle;
    if (!map.has(id)) {
      map.set(id, {
        eventId: photo.eventId,
        eventTitle: photo.eventTitle,
        eventDate: photo.eventDate,
        photos: [],
      });
    }
    map.get(id)!.photos.push(photo);
  }
  return [...map.values()];
});

const lightboxOpen = ref(false);
const lightboxPhotos = ref<EventPhotoItem[]>([]);
const activeSlide = ref(0);
const carouselRef = ref<{ goTo?: (slide: number, dontAnimate?: boolean) => void } | null>(null);
const lightboxTitle = computed(
  () => lightboxPhotos.value[activeSlide.value]?.eventTitle || 'Event photos'
);
const lightboxKey = computed(() => lightboxPhotos.value.map((p) => p.key).join('-') || 'empty');

function openEventLightbox(photos: EventPhotoItem[], idx: number) {
  lightboxPhotos.value = photos;
  activeSlide.value = idx;
  lightboxOpen.value = true;
}

function onSlideChange(current: number) {
  activeSlide.value = current;
}

async function onLightboxOpenChange(open: boolean) {
  if (!open) return;
  await nextTick();
  carouselRef.value?.goTo?.(activeSlide.value, true);
}

const openComplaints = computed(
  () =>
    (yearData.value?.complaints || []).filter((c: { status: string }) =>
      ['open', 'in_progress'].includes(c.status)
    ).length
);

const enrollmentColumns = [
  {
    title: 'Academic year',
    customRender: ({ record }: any) => {
      const name = record.sessionId?.name || '—';
      return record.sessionId?.isActive ? `${name} (current)` : name;
    },
  },
  {
    title: 'Class',
    customRender: ({ record }: any) => record.classId?.name || '—',
  },
  {
    title: 'Section',
    customRender: ({ record }: any) => record.sectionId?.name || '—',
  },
  { title: 'Roll', dataIndex: 'rollNo' },
  {
    title: 'Classroom',
    customRender: ({ record }: any) => {
      const room = record.classroomId;
      if (!room) return '—';
      const floor = room.floorId?.name ? ` · ${room.floorId.name}` : '';
      return `${room.name || room.code || '—'}${floor}`;
    },
  },
  {
    title: 'Status',
    customRender: ({ record }: any) => record.status || '—',
  },
];

function categoryLabel(cat: string) {
  return FEE_CATEGORY_LABELS[cat as FeeCategory] || cat;
}

function formatFeeMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month) ? dayjs(`${month}-01`).format('MMM YYYY') : month;
}

const otherFeesByMonth = computed(() => {
  const list = (yearData.value?.fees?.otherFees || []) as {
    _id: string;
    title: string;
    description?: string;
    amount: number;
    paidAmount?: number;
    pendingAmount?: number;
    status?: string;
    billingMonth?: string;
    submittedAt?: string;
    paidAt?: string;
  }[];
  const map = new Map<
    string,
    {
      month: string;
      count: number;
      amount: number;
      paidAmount: number;
      pendingAmount: number;
      items: typeof list;
    }
  >();
  for (const fee of list) {
    const month = fee.billingMonth || 'unknown';
    if (!map.has(month)) {
      map.set(month, {
        month,
        count: 0,
        amount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        items: [],
      });
    }
    const g = map.get(month)!;
    g.count += 1;
    g.amount += Number(fee.amount) || 0;
    g.paidAmount += Number(fee.paidAmount) || 0;
    g.pendingAmount +=
      Number(fee.pendingAmount ?? Math.max(0, Number(fee.amount) - Number(fee.paidAmount || 0))) || 0;
    g.items.push(fee);
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      amount: Math.round(g.amount * 100) / 100,
      paidAmount: Math.round(g.paidAmount * 100) / 100,
      pendingAmount: Math.round(g.pendingAmount * 100) / 100,
    }))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)));
});

const otherFeeMonthColumns = [
  {
    title: 'Month',
    customRender: ({ record }: { record: { month: string } }) => formatFeeMonth(record.month),
  },
  {
    title: 'Entries',
    dataIndex: 'count',
  },
  {
    title: 'Total',
    customRender: ({ record }: { record: { amount: number } }) =>
      `₹${Number(record.amount).toLocaleString('en-IN')}`,
  },
  {
    title: 'Pending',
    customRender: ({ record }: { record: { pendingAmount: number } }) =>
      `₹${Number(record.pendingAmount).toLocaleString('en-IN')}`,
  },
  // { title: '', key: 'pay', width: 80 },
];

const otherFeeDetailColumns = [
  { title: 'Title', dataIndex: 'title' },
  {
    title: 'Description',
    dataIndex: 'description',
    ellipsis: true,
    customRender: ({ text }: { text?: string }) => text || '—',
  },
  {
    title: 'Amount',
    customRender: ({ record }: { record: { amount: number } }) =>
      `₹${Number(record.amount).toLocaleString('en-IN')}`,
  },
  { title: 'Status', dataIndex: 'status' },
  {
    title: 'Submitted',
    customRender: ({ record }: { record: { submittedAt?: string } }) =>
      record.submittedAt ? dayjs(record.submittedAt).format('DD MMM YYYY HH:mm') : '—',
  },
  {
    title: 'Paid on',
    customRender: ({ record }: { record: { paidAt?: string } }) =>
      record.paidAt ? dayjs(record.paidAt).format('DD MMM YYYY HH:mm') : '—',
  },
  { title: '', key: 'actions', width: 140 },
];

const monthPayOpen = ref(false);
const monthPaySaving = ref(false);
const monthPay = reactive({
  month: '',
  monthLabel: '',
  dueAmount: 0,
  amount: 0,
  method: 'cash',
  reference: '',
  breakdown: [] as { category: string; label: string; amount: number }[],
  invoices: [] as { _id: string; invoiceNo: string; pendingAmount: number }[],
});

function openMonthPay(monthRecord: {
  month: string;
  pendingAmount: number;
  byCategory?: Record<string, number>;
  invoices?: { _id: string; invoiceNo: string; pendingAmount: number }[];
}) {
  if (!canCollectFees.value) return;
  const pending = Number(monthRecord.pendingAmount) || 0;
  if (pending <= 0) {
    message.info('Nothing pending for this month');
    return;
  }
  const openInvoices = (monthRecord.invoices || [])
    .filter((i) => Number(i.pendingAmount) > 0)
    .map((i) => ({
      _id: String(i._id),
      invoiceNo: i.invoiceNo,
      pendingAmount: Number(i.pendingAmount) || 0,
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);
  if (!openInvoices.length) {
    message.warning('No open invoice found for this month');
    return;
  }
  monthPay.month = monthRecord.month;
  monthPay.monthLabel = formatFeeMonth(monthRecord.month);
  monthPay.dueAmount = Math.round(pending * 100) / 100;
  monthPay.amount = monthPay.dueAmount;
  monthPay.method = 'cash';
  monthPay.reference = '';
  monthPay.invoices = openInvoices;
  monthPay.breakdown = Object.entries(monthRecord.byCategory || {})
    .filter(([, amt]) => Number(amt) > 0)
    .map(([category, amount]) => ({
      category,
      label: categoryLabel(category),
      amount: Math.round(Number(amount) * 100) / 100,
    }));
  monthPayOpen.value = true;
}

function openOtherFeesMonthPay(record: {
  month: string;
  pendingAmount: number;
  items: {
    _id: string;
    title?: string;
    invoiceNo?: string;
    amount?: number;
    paidAmount?: number;
    pendingAmount?: number;
    status?: string;
  }[];
}) {
  if (!canCollectFees.value) return;
  const pending = Number(record.pendingAmount) || 0;
  if (pending <= 0) {
    message.info('Nothing pending for this month');
    return;
  }
  const openInvoices = (record.items || [])
    .map((i) => {
      const linePending =
        Number(
          i.pendingAmount ?? Math.max(0, Number(i.amount || 0) - Number(i.paidAmount || 0))
        ) || 0;
      return {
        _id: String(i._id),
        invoiceNo: i.invoiceNo || i.title || 'Other fee',
        pendingAmount: linePending,
        title: i.title || 'Other fee',
      };
    })
    .filter((i) => i.pendingAmount > 0)
    .sort((a, b) => b.pendingAmount - a.pendingAmount);
  if (!openInvoices.length) {
    message.warning('No open other-fee invoice for this month');
    return;
  }
  monthPay.month = record.month;
  monthPay.monthLabel = formatFeeMonth(record.month);
  monthPay.dueAmount = Math.round(pending * 100) / 100;
  monthPay.amount = monthPay.dueAmount;
  monthPay.method = 'cash';
  monthPay.reference = '';
  monthPay.invoices = openInvoices.map(({ _id, invoiceNo, pendingAmount }) => ({
    _id,
    invoiceNo,
    pendingAmount,
  }));
  monthPay.breakdown = openInvoices.map((i) => ({
    category: 'other',
    label: i.title,
    amount: i.pendingAmount,
  }));
  monthPayOpen.value = true;
}

async function submitMonthPay() {
  if (!monthPay.invoices.length) {
    message.warning('No open invoices');
    return Promise.reject();
  }
  if (!monthPay.amount || monthPay.amount <= 0) {
    message.warning('Enter amount to pay');
    return Promise.reject();
  }
  if (monthPay.amount > monthPay.dueAmount) {
    message.warning('Amount cannot exceed month pending');
    return Promise.reject();
  }
  monthPaySaving.value = true;
  try {
    let remaining = Math.round(monthPay.amount * 100) / 100;
    const note = monthPay.reference.trim() || undefined;
    for (const inv of monthPay.invoices) {
      if (remaining <= 0) break;
      const due = Math.round(Number(inv.pendingAmount) * 100) / 100;
      if (due <= 0) continue;
      const pay = Math.min(remaining, due);
      await api.post('/fees/payments', {
        invoiceId: inv._id,
        amount: pay,
        method: monthPay.method,
        reference: note,
      });
      remaining = Math.round((remaining - pay) * 100) / 100;
    }
    message.success(`Payment collected for ${monthPay.monthLabel}`);
    monthPayOpen.value = false;
    await load({ silent: true });
  } finally {
    monthPaySaving.value = false;
  }
}

const feeMonthColumns = [
  { title: 'Month', key: 'month' },
  {
    title: 'Billed',
    customRender: ({ record }: { record: { totalAmount: number } }) =>
      `₹${Number(record.totalAmount).toLocaleString('en-IN')}`,
  },
  {
    title: 'Paid',
    customRender: ({ record }: { record: { paidAmount: number } }) =>
      `₹${Number(record.paidAmount).toLocaleString('en-IN')}`,
  },
  { title: 'Prev. due', key: 'prevDue' },
  { title: 'Month due', key: 'monthDue' },
  { title: 'Balance', key: 'balance' },
  // { title: '', key: 'pay', width: 80 },
  { title: 'PDF', key: 'actions', width: 180 },
];

const complaintColumns = [
  { title: 'Date', customRender: ({ record }: any) => dayjs(record.raisedOn).format('DD MMM YYYY') },
  { title: 'Title', dataIndex: 'title' },
  { title: 'Category', dataIndex: 'category' },
  { title: 'Status', dataIndex: 'status' },
  { title: 'Raised by', dataIndex: 'raisedBy' },
];

const eventColumns = [
  { title: 'Date', customRender: ({ record }: any) => dayjs(record.eventDate).format('DD MMM YYYY') },
  { title: 'Event', key: 'event' },
  { title: 'Role', dataIndex: 'role' },
  { title: 'Attendance', dataIndex: 'attendance' },
  { title: 'Result', dataIndex: 'result' },
];

const marksColumns = [
  { title: 'Exam', dataIndex: 'examName' },
  { title: 'Type', dataIndex: 'examType' },
  { title: 'Subject', dataIndex: 'subject' },
  {
    title: 'Marks',
    customRender: ({ record }: any) => `${record.obtainedMarks}/${record.maxMarks}`,
  },
  { title: 'Grade', dataIndex: 'grade' },
];

const unitColumns = [
  { title: 'Unit', dataIndex: 'unitName' },
  { title: 'Subject', dataIndex: 'subject' },
  { title: 'Date', customRender: ({ record }: any) => dayjs(record.testDate).format('DD MMM YYYY') },
  {
    title: 'Marks',
    customRender: ({ record }: any) => `${record.obtainedMarks}/${record.maxMarks}`,
  },
  { title: 'Remark', dataIndex: 'teacherRemark' },
];

const previewOpen = ref(false);
const previewLoading = ref(false);
const previewUrl = ref<string | null>(null);
const previewTitle = ref('Fee PDF preview');
const previewDownloadName = ref('fee-document.pdf');
const previewFetchPath = ref<string | null>(null);
const itrLoading = ref(false);

const chargeOpen = ref(false);
const chargeSaving = ref(false);
const chargeForm = reactive({
  invoiceId: '' as string,
  title: '',
  description: '',
  amount: 0,
  billingMonth: dayjs() as Dayjs | null,
});

const studentInvoiceOpen = ref(false);
const studentInvoiceSaving = ref(false);
const studentInvoice = reactive({
  studentId: '',
  studentLabel: '',
  sessionId: '' as string | undefined,
  sessionLabel: '',
  amount: 0,
  description: '',
  method: 'cash',
  billingMonth: dayjs() as Dayjs | null,
});

function openStudentInvoiceCreate() {
  const s = profile.value?.student;
  const year = selectedYear.value;
  const sessionName = year?.session?.name || sessionOptions.value.find((o) => o.value === selectedSessionId.value)?.label || '';
  studentInvoice.studentId = studentId();
  studentInvoice.studentLabel = s
    ? `${s.admissionNo || ''} — ${s.firstName || ''} ${s.lastName || ''}`.trim()
    : fullName.value;
  studentInvoice.sessionId = selectedSessionId.value;
  studentInvoice.sessionLabel = sessionName || 'Active session';
  studentInvoice.amount = 0;
  studentInvoice.description = '';
  studentInvoice.method = 'cash';
  studentInvoice.billingMonth = dayjs();
  studentInvoiceOpen.value = true;
}

async function submitStudentInvoice(paymentStatus: 'pending' | 'paid') {
  if (!studentInvoice.studentId) {
    message.warning('Student missing');
    return;
  }
  if (!studentInvoice.amount || studentInvoice.amount <= 0) {
    message.warning('Enter amount');
    return;
  }
  if (!studentInvoice.description.trim()) {
    message.warning('Enter description');
    return;
  }
  if (!studentInvoice.billingMonth) {
    message.warning('Select billing month');
    return;
  }
  studentInvoiceSaving.value = true;
  try {
    const { data } = await api.post('/fees/invoices', {
      studentId: studentInvoice.studentId,
      amount: studentInvoice.amount,
      description: studentInvoice.description.trim(),
      sessionId: studentInvoice.sessionId,
      billingMonth: studentInvoice.billingMonth.format('YYYY-MM'),
      paymentStatus,
      paymentMethod: studentInvoice.method,
    });
    if (paymentStatus === 'paid') {
      const created = data.data;
      const adv = Number(created?.advanceAmount || 0);
      const settled = Number(created?.settledAmount || 0);
      if (adv > 0 && settled <= 0) {
        message.success(`No dues — recorded as advance paid ₹${adv.toLocaleString('en-IN')}`);
      } else if (adv > 0) {
        message.success(
          `Cleared ₹${settled.toLocaleString('en-IN')} dues; ₹${adv.toLocaleString('en-IN')} kept as advance`,
        );
      } else {
        message.success('Payment applied to pending month dues');
      }
    } else {
      message.success('Invoice created as pending');
    }
    studentInvoiceOpen.value = false;
    sectionTab.value = 'fees';
    await load({ silent: true });
  } finally {
    studentInvoiceSaving.value = false;
  }
}

function resetChargeForm() {
  chargeForm.invoiceId = '';
  chargeForm.title = '';
  chargeForm.description = '';
  chargeForm.amount = 0;
  chargeForm.billingMonth = dayjs();
}

function openOtherFeeCreate() {
  resetChargeForm();
  chargeOpen.value = true;
}

function openOtherFeeEdit(record: {
  _id: string;
  title: string;
  description?: string;
  amount: number;
  billingMonth?: string;
}) {
  chargeForm.invoiceId = record._id;
  chargeForm.title = record.title || '';
  chargeForm.description = record.description || '';
  chargeForm.amount = Number(record.amount) || 0;
  chargeForm.billingMonth = record.billingMonth
    ? dayjs(`${record.billingMonth}-01`)
    : dayjs();
  chargeOpen.value = true;
}

async function removeOtherFee(invoiceId: string) {
  await api.delete(`/fees/students/${studentId()}/charges/${invoiceId}`);
  message.success('Other fee removed');
  await load({ silent: true });
}

async function submitCharge(paymentStatus: 'pending' | 'paid') {
  if (!chargeForm.title.trim() || !chargeForm.amount || chargeForm.amount <= 0) {
    message.warning('Enter title and amount');
    return;
  }
  if (!chargeForm.billingMonth) {
    message.warning('Select a month');
    return;
  }
  chargeSaving.value = true;
  try {
    const payload = {
      title: chargeForm.title.trim(),
      description: chargeForm.description.trim() || undefined,
      amount: chargeForm.amount,
      paymentStatus,
      billingMonth: chargeForm.billingMonth.format('YYYY-MM'),
      sessionId: selectedSessionId.value,
    };
    if (chargeForm.invoiceId) {
      await api.patch(`/fees/students/${studentId()}/charges/${chargeForm.invoiceId}`, payload);
      message.success('Other fee updated');
    } else {
      await api.post(`/fees/students/${studentId()}/charges`, payload);
      message.success(
        paymentStatus === 'paid' ? 'Other fee saved as paid' : 'Other fee added to pending'
      );
    }
    chargeOpen.value = false;
    resetChargeForm();
    await load({ silent: true });
  } finally {
    chargeSaving.value = false;
  }
}

const transportOpen = ref(false);
const transportSaving = ref(false);
const routeOptions = ref<{ label: string; value: string; stops?: { name: string }[] }[]>([]);
const stopOptions = ref<{ label: string; value: string }[]>([]);
const tierOptions = ref<{ label: string; value: string }[]>([]);
const transportForm = reactive({
  routeId: '',
  stopName: '',
  feeTierId: '',
});

async function openTransportAssign() {
  transportOpen.value = true;
  const [routes, tiers] = await Promise.all([
    api.get('/transport/routes'),
    api.get('/transport/fee-tiers'),
  ]);
  routeOptions.value = (routes.data.data || []).map((r: any) => ({
    label: r.name,
    value: String(r._id),
    stops: r.stops || [],
  }));
  tierOptions.value = (tiers.data.data || []).map((t: any) => ({
    label: `${t.name} (≤${t.maxKm} km) — ₹${Number(t.monthlyAmount).toLocaleString('en-IN')}/mo`,
    value: String(t._id),
  }));
  transportForm.routeId = profile.value?.transport?.routeId || '';
  transportForm.stopName = profile.value?.transport?.stopName || '';
  transportForm.feeTierId = profile.value?.transport?.feeTierId || '';
  onRouteChange(transportForm.routeId);
}

function onRouteChange(routeId: string) {
  const route = routeOptions.value.find((r) => r.value === routeId);
  stopOptions.value = (route?.stops || []).map((s) => ({ label: s.name, value: s.name }));
  if (!stopOptions.value.some((s) => s.value === transportForm.stopName)) {
    transportForm.stopName = stopOptions.value[0]?.value || '';
  }
}

async function saveTransport() {
  if (!transportForm.routeId || !transportForm.stopName || !transportForm.feeTierId) {
    message.warning('Select route, stop and distance fee slab');
    return Promise.reject();
  }
  transportSaving.value = true;
  try {
    await api.post('/transport/assignments', {
      studentId: studentId(),
      routeId: transportForm.routeId,
      stopName: transportForm.stopName,
      feeTierId: transportForm.feeTierId,
    });
    message.success('Transport and fee assigned for this student');
    transportOpen.value = false;
    await load({ silent: true });
  } catch (e) {
    return Promise.reject(e);
  } finally {
    transportSaving.value = false;
  }
}

function studentId() {
  return String(route.params.id);
}

async function fetchPdfBlob(path: string, params?: Record<string, string>) {
  const res = await api.get(path, {
    params: { ...params, inline: '1' },
    responseType: 'blob',
  });
  return res.data as Blob;
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
}

function closePreview() {
  previewOpen.value = false;
  revokePreview();
  previewFetchPath.value = null;
}

async function openPdfPreview(opts: {
  title: string;
  path: string;
  params?: Record<string, string>;
  downloadName: string;
}) {
  revokePreview();
  previewTitle.value = opts.title;
  previewDownloadName.value = opts.downloadName;
  previewFetchPath.value = opts.path;
  previewOpen.value = true;
  previewLoading.value = true;
  try {
    const blob = await fetchPdfBlob(opts.path, opts.params);
    previewUrl.value = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  } catch {
    message.error('Failed to load PDF preview');
    previewOpen.value = false;
  } finally {
    previewLoading.value = false;
  }
}

async function downloadPdf(path: string, filename: string, params?: Record<string, string>) {
  try {
    const res = await api.get(path, {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    message.error('Download failed');
  }
}

async function previewMonthReceipt(month: string) {
  await openPdfPreview({
    title: `Month fee receipt — ${dayjs(`${month}-01`).format('MMM YYYY')}`,
    path: `/fees/students/${studentId()}/month-receipt.pdf`,
    params: { month },
    downloadName: `fee-month-${studentId()}-${month}.pdf`,
  });
}

async function downloadMonthReceipt(month: string) {
  await downloadPdf(
    `/fees/students/${studentId()}/month-receipt.pdf`,
    `fee-month-${month}.pdf`,
    { month }
  );
}

async function previewItrStatement() {
  itrLoading.value = true;
  try {
    await openPdfPreview({
      title: 'FY fee statement (ITR) — till today',
      path: `/fees/students/${studentId()}/itr-statement.pdf`,
      downloadName: `fee-ITR-${studentId()}.pdf`,
    });
  } finally {
    itrLoading.value = false;
  }
}

async function downloadItrStatement(fromPreview = false) {
  itrLoading.value = true;
  try {
    await downloadPdf(
      `/fees/students/${studentId()}/itr-statement.pdf`,
      `fee-ITR-till-today.pdf`
    );
    if (!fromPreview) message.success('FY statement downloaded');
  } finally {
    itrLoading.value = false;
  }
}

async function downloadFromPreview() {
  if (previewFetchPath.value?.includes('itr-statement')) {
    await downloadItrStatement(true);
    return;
  }
  if (previewFetchPath.value?.includes('month-receipt')) {
    const month = previewDownloadName.value.match(/(\d{4}-\d{2})/)?.[1];
    if (month) await downloadMonthReceipt(month);
    return;
  }
}

function openPreviewInTab() {
  if (!previewUrl.value) return;
  window.open(previewUrl.value, '_blank');
}

async function load(opts?: { silent?: boolean }) {
  const silent = Boolean(opts?.silent && profile.value);
  if (silent) refreshing.value = true;
  else loading.value = true;
  const prevSessionId = selectedSessionId.value;
  try {
    const id = String(route.params.id);
    const { data } = await api.get(`/students/${id}/profile`);
    profile.value = data.data;
    const years = data.data?.years || [];
    if (silent && prevSessionId && years.some((y: { sessionId: string }) => y.sessionId === prevSessionId)) {
      selectedSessionId.value = prevSessionId;
    } else {
      const active = years.find((y: { isActive?: boolean }) => y.isActive);
      selectedSessionId.value = active?.sessionId || years[0]?.sessionId;
    }
  } catch {
    if (!silent) {
      profile.value = null;
      selectedSessionId.value = undefined;
    }
    message.error('Unable to load student profile');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function uploadPhoto(options: {
  file: File;
  onSuccess?: (b: unknown) => void;
  onError?: (e: Error) => void;
}) {
  try {
    const id = String(route.params.id);
    const fd = new FormData();
    fd.append('file', options.file);
    const { data } = await api.post('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await api.patch(`/students/${id}`, { photoUrl: data.data.url });
    message.success('Photo updated');
    options.onSuccess?.(data);
    await load({ silent: true });
  } catch (e) {
    options.onError?.(e as Error);
  }
}

watch(
  () => route.params.id,
  () => {
    selectedSessionId.value = undefined;
    load();
  }
);

onMounted(() => {
  load();
});
</script>

<style scoped>
.profile-page .page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.muted {
  color: #888;
}
.fee-settled {
  color: #389e0d !important;
  font-weight: 600;
}
.fees-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.preview-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.receipt-frame {
  width: 100%;
  height: 70vh;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
}
.event-photo-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.event-photo-group .group-title {
  margin-bottom: 8px;
  font-weight: 600;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}
.photo-tile {
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #f0f0f0;
}
.photo-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}
.photo-tile:hover img {
  transform: scale(1.04);
}
.lightbox-body {
  margin: -8px 0 0;
}
.photo-slider {
  background: #111;
  border-radius: 10px;
  overflow: hidden;
}
.photo-slider :deep(.slick-slide) {
  text-align: center;
}
.photo-slider :deep(.slick-dots) {
  bottom: 12px;
}
.photo-slider :deep(.slick-dots li button) {
  background: #fff;
  opacity: 0.45;
}
.photo-slider :deep(.slick-dots li.slick-active button) {
  opacity: 1;
}
.photo-slider :deep(.slick-prev),
.photo-slider :deep(.slick-next) {
  z-index: 2;
  width: 40px;
  height: 40px;
  color: #fff;
  font-size: 32px;
  line-height: 40px;
}
.photo-slider :deep(.slick-prev) {
  inset-inline-start: 12px;
}
.photo-slider :deep(.slick-next) {
  inset-inline-end: 12px;
}
.slide-inner {
  height: min(70vh, 520px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.slide-inner img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.lightbox-meta {
  text-align: center;
  margin-top: 10px;
  color: rgba(0, 0, 0, 0.65);
}
</style>
