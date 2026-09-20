import SwiftUI

struct UtteranceRow: View {
    let segment: TranscriptSegment
    let query: String
    let matched: Bool
    let active: Bool
    let completed: Bool
    let seek: () -> Void
    let save: (String) -> Void
    @State private var editing = false
    @State private var draft = ""
    @FocusState private var focused: Bool

    var highlighted: AttributedString {
        var result = AttributedString(segment.text)
        guard !query.isEmpty else { return result }
        var start = result.startIndex
        while start < result.endIndex, let range = result[start...].range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) {
            result[range].backgroundColor = StudioStyle.accent.opacity(0.2)
            result[range].foregroundColor = .primary
            start = range.upperBound
        }
        return result
    }
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: seek) {
                Text(StudioStyle.time(segment.start)).font(.system(.caption, design: .monospaced)).padding(.vertical, 5)
            }.buttonStyle(.plain).foregroundStyle(active ? StudioStyle.accent : .secondary).frame(width: 48).help("Play from this timestamp")
            VStack(alignment: .leading, spacing: 7) {
                if let name = segment.speakerName { Text(name).font(.caption).foregroundStyle(.secondary) }
                if editing {
                    TextField("Utterance", text: $draft, axis: .vertical).font(.title3).lineSpacing(6).textFieldStyle(.plain).focused($focused)
                        .onSubmit(commit)
                } else {
                    Text(highlighted).font(.title3).lineSpacing(6).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(completed && !active ? .secondary : .primary)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
            Button(editing ? "Save edit" : "Edit utterance", systemImage: editing ? "checkmark" : "pencil") {
                if editing { commit() } else { draft = segment.text; editing = true; focused = true }
            }.labelStyle(.iconOnly).studioButton(prominent: editing).help(editing ? "Save" : "Edit utterance")
        }
        .padding(12)
        .background(StudioStyle.accent.opacity(matched ? 0.1 : active ? 0.055 : 0), in: .rect(cornerRadius: 14))
        .background(.primary.opacity(editing ? 0.055 : 0.018), in: .rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(.primary.opacity(editing ? 0.18 : 0.045)) }
        .overlay(alignment: .leading) { Capsule().fill(StudioStyle.accent).frame(width: 3).padding(.vertical, 16).opacity(active || matched ? 1 : 0) }
        .onDisappear { if editing { commit() } }
    }
    func commit() {
        guard editing else { return }
        editing = false; focused = false
        if draft != segment.text { save(draft) }
    }
}
