import SwiftUI
import UniformTypeIdentifiers

struct ExportSheet: View {
    let job: JobDetail
    @Environment(StudioStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var format = "md"
    @State private var content = "transcript"
    @State private var timestamps = false
    @State private var busy = false
    @State private var error: String?
    @State private var destination = "file"
    @State private var confirmDelivery = false
    @State private var step = 0
    @State private var destinations: ExportDestinations?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var contentTitle: String { content == "transcript" ? "Transcript" : content == "minutes" ? "Meeting minutes" : "Action items" }
    private var available: Bool {
        switch destination {
        case "obsidian": !(destinations?.obsidianVault.isEmpty ?? true)
        case "notion": destinations?.notionConnected == true && !(destinations?.notionParentId.isEmpty ?? true)
        case "webhook": !(destinations?.webhookUrl.isEmpty ?? true)
        default: true
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                DestinationIllustration(symbol: "arrow.triangle.branch").frame(width: 64, height: 68)
                VStack(alignment: .leading, spacing: 6) {
                    Text(step == 0 ? "What would you like to export?" : "Where should it go?").font(.title2.bold())
                    Text(job.title).font(.callout).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Text("\(step + 1) / 2").font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }.padding(24)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if step == 0 {
                        VStack(spacing: 8) {
                            ExportChoice(title: "Transcript", subtitle: "Every word, ready to keep.", symbol: "text.alignleft", selected: content == "transcript") { content = "transcript" }
                            ExportChoice(title: "Meeting minutes", subtitle: "Summary, decisions, and notes.", symbol: "doc.text", selected: content == "minutes") { content = "minutes"; normalizeFormat() }
                            ExportChoice(title: "Action items", subtitle: "Just the next steps.", symbol: "checklist", selected: content == "actions") { content = "actions"; normalizeFormat() }
                        }
                        HStack {
                            Text("File format").font(.headline)
                            Spacer()
                            Picker("File format", selection: $format) {
                                ForEach(["md", "txt", "pdf", "docx", "csv", "json", "bundle"] + (content == "transcript" ? ["srt", "vtt"] : []), id: \.self) { value in
                                    Text(value == "bundle" ? "Transcript + media (ZIP)" : value == "md" ? "Markdown" : value.uppercased()).tag(value)
                                }
                            }.labelsHidden().frame(width: 230)
                        }.padding(16).studioGlass(radius: 14)
                    } else {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ExportChoice(title: "Save file", subtitle: "Choose a folder on your Mac.", symbol: "folder", platform: "file", selected: destination == "file") { destination = "file" }
                            ExportChoice(title: "Obsidian", subtitle: "Markdown in your vault.", symbol: "", platform: "obsidian", selected: destination == "obsidian") { destination = "obsidian" }
                            ExportChoice(title: "Notion", subtitle: "Send to your connected page.", symbol: "", platform: "notion", selected: destination == "notion") { destination = "notion" }
                            ExportChoice(title: "Webhook", subtitle: "Send to your workflow.", symbol: "", platform: "webhook", selected: destination == "webhook") { destination = "webhook" }
                        }
                        VStack(alignment: .leading, spacing: 14) {
                            Label(contentTitle, systemImage: "doc.text").font(.headline)
                            Text(destination == "file" ? (format == "bundle" ? "ZIP archive with transcript and media" : "\(format.uppercased()) file") : destination == "obsidian" ? "Markdown sent to Obsidian" : "Send to \(destination.capitalized)")
                                .font(.callout).foregroundStyle(.secondary)
                            if destination == "file" && !["srt", "vtt"].contains(format) {
                                Toggle("Include timestamps", isOn: $timestamps)
                            }
                            if !available {
                                Text("Set up \(destination.capitalized) in Settings / Destinations.").font(.callout).foregroundStyle(.secondary)
                            }
                        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).studioGlass(radius: 16)
                    }
                    if let error { Text(error).font(.callout).foregroundStyle(.red) }
                }.padding(.horizontal, 24).padding(.bottom, 20)
            }.frame(height: 390)
            Divider().opacity(0.25)
            HStack(spacing: 12) {
                Button("Cancel", role: .cancel) { dismiss() }.studioButton().keyboardShortcut(.cancelAction).disabled(busy)
                Spacer()
                if busy { ProgressView().controlSize(.small) }
                if step == 1 { Button("Back") { changeStep(0) }.studioButton().disabled(busy) }
                Button(step == 0 ? "Continue" : destination == "file" ? "Save file…" : "Send to \(destination.capitalized)") {
                    if step == 0 { changeStep(1) }
                    else if destination == "file" { Task { await save() } }
                    else { confirmDelivery = true }
                }.studioButton(prominent: true).keyboardShortcut(.defaultAction)
                    .disabled(busy || (step == 1 && !available))
            }.padding(24)
        }
        .frame(width: 640)
        .background { WorkspaceBackground() }
        .interactiveDismissDisabled(busy)
        .task {
            guard let api = store.api else { return }
            do { destinations = try await api.request("export-destinations") }
            catch { self.error = error.localizedDescription }
        }
        .confirmationDialog("Send \(contentTitle.lowercased()) to \(destination.capitalized)?", isPresented: $confirmDelivery) {
            Button("Send") { Task { await deliver() } }
        }
    }
    private func changeStep(_ value: Int) {
        withAnimation(reduceMotion ? nil : StudioStyle.spring) { step = value }
    }
    private func normalizeFormat() { if ["srt", "vtt"].contains(format) { format = "md" } }
    func save() async {
        guard let api = store.api else { return }
        let panel = NSSavePanel()
        let suffix = format == "bundle" ? "zip" : format
        panel.nameFieldStringValue = job.title.replacing("/", with: "-") + "." + suffix
        panel.allowedContentTypes = [UTType(filenameExtension: suffix) ?? .data]
        guard await panel.begin() == .OK, let destination = panel.url else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.download("jobs/\(job.id)/export/\(format)?view=\(content)&timestamps=\(timestamps)", to: destination)
            store.notice = "Export saved"
            NSWorkspace.shared.activateFileViewerSelecting([destination])
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
    func deliver() async {
        guard let api else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.mutate("jobs/\(job.id)/deliver/\(destination)", body: ["view": content])
            store.notice = "Sent to \(destination.capitalized)"; dismiss()
        } catch { self.error = error.localizedDescription }
    }
    private var api: StudioAPI? { store.api }
}
