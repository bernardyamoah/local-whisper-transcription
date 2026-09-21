import SwiftUI

struct TranscriptionProgress: View {
    let job: JobDetail
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var progressSize = 48
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            CompanionOrb(active: job.active).frame(width: 230, height: 230)
            Text(job.state.capitalized).font(.title).bold()
            if job.active {
                Text(job.progress / 100, format: .percent.precision(.fractionLength(0))).font(.system(size: progressSize, weight: .light, design: .rounded))
                    .monospacedDigit().contentTransition(.numericText()).animation(reduceMotion ? nil : .smooth, value: job.progress)
                ProgressView(value: job.progress, total: 100).frame(maxWidth: 340).animation(reduceMotion ? nil : .smooth(duration: 0.4), value: job.progress)
                if let start = job.started { Text(Date(timeIntervalSince1970: start), style: .timer).font(.callout).monospacedDigit().foregroundStyle(.secondary) }
                Button("Cancel") { Task { await store.perform("jobs/\(job.id)/cancel") } }.studioButton(.ghost)
            } else {
                if let error = job.error { Text(error).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 450) }
                Button("Retry") { Task { await store.perform("jobs/\(job.id)/retry") } }.studioButton(.primary)
            }
            Spacer()
        }.frame(maxWidth: .infinity)
    }
}
