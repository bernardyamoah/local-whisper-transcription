import SwiftUI
import UniformTypeIdentifiers

struct StudioRootView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        @Bindable var store = store
        Group {
            if store.loading {
                VStack(spacing: 12) { CompanionOrb(active: true).frame(width: 180, height: 180); ProgressView("Opening your workspace") }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background { WorkspaceBackground() }
            } else if store.api == nil {
                ContentUnavailableView {
                    Label("Unable to open the workspace", systemImage: "exclamationmark.triangle")
                } description: { Text(store.error ?? "The local engine is unavailable.") } actions: {
                    Button("Try Again") { Task { await store.start() } }
                }
            } else if store.showOnboarding {
                WelcomeView()
            } else if store.route == .settings {
                StudioSettingsView()
            } else {
                NavigationSplitView {
                    StudioSidebar()
                } detail: {
                    Group {
                        switch store.route {
                        case .capture, nil: CaptureView()
                        case .library: LibraryView()
                        case .settings: StudioSettingsView()
                        case .job(let id): TranscriptView(jobId: id).id(id)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background { WorkspaceBackground() }

                    .safeAreaInset(edge: .bottom) {
                        if store.recording.active && store.route != .capture { RecordingIsland().padding() }
                    }
                }
                .navigationSplitViewStyle(.balanced)
                .navigationTitle("Whisper Studio")
                .toolbar(id: "workspace") {
                    ToolbarItem(id: "import", placement: .primaryAction) {
                        Button("Import", systemImage: "square.and.arrow.down") { store.showImporter = true }
                            .disabled(store.busy || store.recording.active).help("Import recording — Command-O")
                    }
                    ToolbarItem(id: "new", placement: .primaryAction) {
                        Button("New recording", systemImage: "plus") { store.route = .capture }.help("New recording — Command-N")
                    }
                }
                .background { WorkspaceBackground() }
            }
        }
        .animation(reduceMotion ? nil : StudioStyle.spring, value: store.showOnboarding)
        .fileImporter(isPresented: $store.showImporter, allowedContentTypes: [.audio, .movie, .mpeg4Movie, .data]) { result in
            switch result {
            case .success(let url): Task { await store.importFile(url) }
            case .failure(let error): store.error = error.localizedDescription
            }
        }
        .overlay(alignment: .top) {
            if let error = store.error, store.api != nil {
                HStack(spacing: 12) {
                    Label(error, systemImage: "exclamationmark.circle").font(.callout)
                    Button("Dismiss", systemImage: "xmark") { store.error = nil }.labelStyle(.iconOnly).buttonStyle(.plain)
                }.padding().background(.regularMaterial, in: .rect(cornerRadius: 14)).padding().frame(maxWidth: 640)
            }
        }
        .overlay(alignment: .bottom) {
            if let notice = store.notice {
                Text(notice).font(.callout).padding().background(.regularMaterial, in: .capsule).padding()
                    .task(id: notice) {
                        do { try await Task.sleep(for: .seconds(4)); store.notice = nil } catch { }
                    }
            }
        }
    }
}
