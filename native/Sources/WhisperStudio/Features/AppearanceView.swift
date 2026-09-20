import SwiftUI

struct AppearanceView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 28) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 16) {
                ForEach(["light", "dark", "system"], id: \.self) { mode in
                    Button {
                        var next = store.preferences; next.appearance = mode
                        Task { await store.savePreferences(next) }
                    } label: {
                        VStack(alignment: .leading, spacing: 18) {
                            AppearanceIllustration(mode: mode).frame(height: 130)
                            HStack {
                                Text(mode.capitalized).font(.headline)
                                Spacer()
                                Image(systemName: store.preferences.appearance == mode ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(store.preferences.appearance == mode ? StudioStyle.accent : .secondary)
                            }
                        }.padding(14).studioGlass(radius: 20)
                            .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(store.preferences.appearance == mode ? StudioStyle.accent : .clear, lineWidth: 2) }
                    }.buttonStyle(.plain).accessibilityLabel("\(mode.capitalized) appearance")
                        .accessibilityAddTraits(store.preferences.appearance == mode ? .isSelected : [])
                }
            }
            Label(store.preferences.appearance == "system" ? "Follows your Mac’s appearance." : "\(store.preferences.appearance.capitalized) throughout your workspace.", systemImage: "circle.lefthalf.filled")
                .font(.callout).foregroundStyle(.secondary)
        }.padding(2).animation(reduceMotion ? nil : StudioStyle.spring, value: store.preferences.appearance)
        }
    }
}
