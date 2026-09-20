import SwiftUI

struct TranscriptContent: View {
    @Bindable var model: TranscriptModel
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(model.job?.segments ?? []) { segment in
                        UtteranceRow(segment: segment, query: model.query, matched: model.matchId == segment.id,
                            active: model.activeId == segment.id, completed: segment.end < model.playback.time,
                            seek: { model.playback.seek(segment.start) },
                            save: { text in if let api = store.api { model.edit(segment: segment, text: text, api: api) } })
                            .id(segment.id)
                    }
                }.padding(.horizontal, 14).padding(.vertical, 20)
            }
            .onChange(of: model.matchId) {
                if let id = model.matchId { withAnimation(reduceMotion ? nil : StudioStyle.spring) { proxy.scrollTo(id, anchor: .center) } }
            }
            .onChange(of: model.query) {
                if let id = model.matchId { withAnimation(reduceMotion ? nil : StudioStyle.spring) { proxy.scrollTo(id, anchor: .center) } }
            }
            .onChange(of: model.activeId) {
                if model.followPlayback && model.playback.playing, model.query.isEmpty, let id = model.activeId {
                    withAnimation(reduceMotion ? nil : StudioStyle.spring) { proxy.scrollTo(id, anchor: .center) }
                }
            }
        }
    }
}
