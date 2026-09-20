import SwiftUI

struct LibraryRow: View {
    let job: JobSummary
    @State private var hover = false
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "waveform").font(.title3).foregroundStyle(StudioStyle.accent).frame(width: 34, height: 34)
                .background(StudioStyle.accent.opacity(0.09), in: .rect(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(job.title).font(.body.weight(.medium)).lineLimit(1)
                HStack(spacing: 8) {
                    Text(StudioStyle.time(job.duration)).monospacedDigit()
                    Text(Date(timeIntervalSince1970: job.created), style: .date)
                }.font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if job.active { ProgressView().controlSize(.small) }
            else if job.state != "completed" { Text(job.state.capitalized).font(.caption).foregroundStyle(.secondary) }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary).accessibilityHidden(true)
        }
        .padding(12).contentShape(.rect)
        .background(.primary.opacity(hover ? 0.045 : 0), in: .rect(cornerRadius: 16))
        .onHover { hover = $0 }
    }
}
