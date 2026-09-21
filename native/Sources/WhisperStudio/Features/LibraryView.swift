import SwiftUI

struct LibraryView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var searchFocused: Bool
    @State private var selection = LibrarySelection()
    private var emptyLibrary: Bool { store.jobs.isEmpty && store.libraryQuery.isEmpty }

    var body: some View {
        @Bindable var store = store
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Library").font(.title2).bold()
                    if !emptyLibrary { Text("\(store.totalJobs) \(store.totalJobs == 1 ? "recording" : "recordings")").foregroundStyle(.secondary) }
                }
                Spacer()
                if !emptyLibrary {
                    StudioGlassGroup(spacing: 10) {
                        HStack(spacing: 10) {
                            Button(selection.selecting ? "Done" : "Select", systemImage: selection.selecting ? "checkmark" : "checkmark.circle") {
                                selection.selecting.toggle(); selection.selected.removeAll()
                            }.studioButton().disabled(selection.deleting)
                            Button("New recording", systemImage: "plus") { store.route = .capture }.studioButton(.primary)
                        }
                    }
                }
            }.controlSize(.regular).padding(20)
            if !emptyLibrary {
                StudioGlassGroup(spacing: 10) {
                    HStack(spacing: 10) {
                        HStack {
                            Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                            TextField("Search your words", text: $store.libraryQuery).textFieldStyle(.plain).focused($searchFocused)
                        }
                        .padding(10)
                        .studioGlass(radius: 14, interactive: true)
                        Picker("Sort", selection: $store.librarySort) {
                            Text("Newest").tag("newest"); Text("Oldest").tag("oldest"); Text("Title").tag("title"); Text("Duration").tag("duration")
                        }.labelsHidden().studioMenuControl().frame(width: 130)
                    }
                }.padding(.horizontal, 20).padding(.bottom, 12)
            }
            if emptyLibrary {
                LibraryEmptyState()
            } else if store.jobs.isEmpty {
                VStack(spacing: 18) {
                    RecordingIllustration(searching: true)
                    Text("No matching recordings").font(.title2.weight(.semibold))
                    Button("Clear search") { store.libraryQuery = "" }.studioButton()
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(store.jobs) { job in
                            HStack(spacing: 0) {
                                if selection.selecting {
                                    Button { selection.toggle(job.id) } label: {
                                        Image(systemName: selection.selected.contains(job.id) ? "checkmark.circle.fill" : "circle").font(.title3)
                                    }.buttonStyle(.plain).accessibilityLabel("Select \(job.title)").accessibilityAddTraits(selection.selected.contains(job.id) ? .isSelected : []).padding(.leading, 16)
                                }
                                Button {
                                    if selection.selecting { selection.toggle(job.id) } else { store.route = .job(job.id) }
                                } label: { LibraryRow(job: job) }.buttonStyle(.plain)
                                if !selection.selecting {
                                    Button("Delete transcript", systemImage: "trash") { selection.propose([job.id]) }
                                        .labelStyle(.iconOnly).studioIconButton(.ghost).foregroundStyle(.red).padding(.trailing, 20).help("Delete transcript")
                                }
                            }
                            .background(.primary.opacity(0.035), in: .rect(cornerRadius: 12))
                            .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(.primary.opacity(selection.selected.contains(job.id) ? 0.3 : 0.06)) }
                            .contextMenu {
                                Button("Open") { store.route = .job(job.id) }
                                Button("Delete…", role: .destructive) { selection.propose([job.id]) }
                            }.disabled(selection.deleting)
                        }
                        if store.jobs.count < store.totalJobs {
                            Button("Load more") { Task { do { try await store.refreshLibrary(loadMore: true) } catch { store.error = error.localizedDescription } } }.padding()
                        }
                    }.padding(.horizontal, 20).padding(.bottom, 24)
                }
            }
            if let failure = selection.failure { Text(failure).foregroundStyle(.red).font(.callout).padding(.horizontal, 20) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .focusedSceneValue(\.workspaceFind, emptyLibrary ? nil : WorkspaceFindActions(find: { searchFocused = true }))
        .safeAreaInset(edge: .bottom) {
            if selection.selecting || selection.deleting {
                HStack(spacing: 18) {
                    Text("\(selection.selected.count) selected").monospacedDigit()
                    Button("Select loaded") { selection.selected.formUnion(store.jobs.map(\.id)) }.studioButton(.ghost)
                    Divider().frame(height: 18)
                    if selection.deleting { ProgressView().controlSize(.small) }
                    Button("Delete", systemImage: "trash", role: .destructive) { selection.propose(selection.selected) }
                        .buttonStyle(.plain).foregroundStyle(.red).disabled(selection.selected.isEmpty || selection.deleting)
                }.padding(10).studioGlass(radius: 12).padding(20).disabled(selection.deleting)
                    .transition(.opacity.combined(with: .offset(y: reduceMotion ? 0 : 10)))
            }
        }
        .animation(reduceMotion ? nil : StudioStyle.spring, value: selection.selecting)
        .task(id: store.libraryQuery + store.librarySort) {
            do { try await Task.sleep(for: .milliseconds(180)); try await store.refreshLibrary() }
            catch is CancellationError { } catch { store.error = error.localizedDescription }
        }
        .confirmationDialog("Delete \(selection.pending.count == 1 ? "this transcript" : "\(selection.pending.count) transcripts")?", isPresented: $selection.confirming, titleVisibility: .visible) {
            Button("Delete transcripts, keep recordings", role: .destructive) { Task { await delete(scope: "transcript") } }
            Button("Delete transcripts and recordings", role: .destructive) { Task { await delete(scope: "all") } }
            Button("Cancel", role: .cancel) { selection.pending.removeAll() }
        } message: { Text("This cannot be undone.") }
    }
    private func delete(scope: String) async {
        guard let api = store.api else { return }
        await selection.delete { id in
            try await api.mutate("jobs/\(id)", method: "DELETE", body: ["scope": scope, "confirm": true])
        }
        do { try await store.refreshLibrary() } catch { store.error = error.localizedDescription }
    }
}
