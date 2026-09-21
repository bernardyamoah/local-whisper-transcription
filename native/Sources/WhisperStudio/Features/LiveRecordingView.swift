import SwiftUI

struct LiveRecordingView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var timerSize = 32
    var body: some View {
        VStack(spacing: 24) {
            HStack(spacing: 24) {
                CompanionOrb(active: true).frame(width: 88, height: 88)
                VStack(alignment: .leading, spacing: 8) {
                    Label("Recording", systemImage: "record.circle.fill").foregroundStyle(StudioStyle.accent).font(.callout)
                    Text(StudioStyle.time(store.recording.elapsed ?? 0)).font(.system(size: timerSize, weight: .light, design: .rounded)).monospacedDigit().contentTransition(.numericText())
                }
                Spacer()
                RecordingWave()
                Button("Mini player", systemImage: "pip") { store.companion.show() }.labelStyle(.iconOnly).help("Show recording overlay")
                Button("Stop recording", systemImage: "stop.fill") { Task { await store.stopRecording() } }
                    .buttonStyle(.plain).foregroundStyle(.red).padding(.horizontal, 12).padding(.vertical, 8)
                    .background(.red.opacity(0.14), in: .capsule).disabled(store.busy)
            }.padding(12).studioGlass(radius: 16)
            Surface {
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Text("Live transcript").font(.headline)
                        Spacer()
                        if store.environment?.jev.enabled == true { Label("Smart Moments", systemImage: "sparkle").font(.callout).foregroundStyle(.secondary) }
                    }
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 22) {
                                if (store.recording.liveTranscript ?? []).isEmpty {
                                    Text("Listening…").foregroundStyle(.secondary).padding(.top, 24)
                                }
                                ForEach(Array((store.recording.liveTranscript ?? []).enumerated()), id: \.offset) { index, line in
                                    HStack(alignment: .top, spacing: 20) {
                                        Text(StudioStyle.time(line.start)).font(.caption).monospacedDigit().foregroundStyle(.secondary).frame(width: 44)
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(line.source).font(.caption).foregroundStyle(.secondary)
                                            Text(line.text).font(.title3).textSelection(.enabled).foregroundStyle(line.final ? .primary : .secondary)
                                        }
                                    }.id(index).transition(.opacity.combined(with: .offset(y: reduceMotion ? 0 : 8)))
                                }
                                Color.clear.frame(height: 1).id("bottom")
                            }.padding(4).animation(reduceMotion ? nil : StudioStyle.spring, value: store.recording.liveTranscript?.count)
                        }.frame(minHeight: 300, maxHeight: 430)
                            .onChange(of: store.recording.liveTranscript?.last?.text) {
                                withAnimation(reduceMotion ? nil : StudioStyle.spring) { proxy.scrollTo("bottom", anchor: .bottom) }
                            }
                    }
                    if let error = store.recording.liveError { Text(error).font(.callout).foregroundStyle(.red) }
                    if let error = store.environment?.jev.error { Text(error).font(.callout).foregroundStyle(.red) }
                    Divider()
                    StudioGlassGroup(spacing: 10) {
                        HStack {
                            ForEach(store.selectedTemplate?.bookmarks ?? ["Key point", "Decision", "Action", "Question"], id: \.self) { kind in
                                Button(kind, systemImage: "bookmark") { Task { await store.bookmark(kind) } }.studioButton()
                            }
                            Spacer()
                            Text("\(store.recording.bookmarks?.count ?? 0) saved").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
