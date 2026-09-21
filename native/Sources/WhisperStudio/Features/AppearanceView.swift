import SwiftUI

struct AppearanceView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("Make room for your words.")
                    .font(.title3).foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 210), spacing: 20)], spacing: 24) {
                    ForEach(["light", "dark", "system"], id: \.self) { mode in
                        themeButton(mode)
                    }
                }
                HStack(spacing: 10) {
                    Image(systemName: "circle.lefthalf.filled")
                    Text(store.preferences.appearance == "system"
                         ? "Changes with your Mac, from day to night."
                         : "Choose System to follow your Mac’s appearance.")
                }
                .font(.callout).foregroundStyle(.secondary)
                .padding(.top, 4)
            }
            .padding(4)
        }
        .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: store.preferences.appearance)
    }

    private func themeButton(_ mode: String) -> some View {
        let selected = store.preferences.appearance == mode
        return Button {
            var next = store.preferences
            next.appearance = mode
            Task { await store.savePreferences(next) }
        } label: {
            VStack(alignment: .leading, spacing: 16) {
                AppearanceIllustration(mode: mode)
                    .aspectRatio(1.05, contentMode: .fit)
                    .clipShape(.rect(cornerRadius: 20))
                    .overlay {
                        RoundedRectangle(cornerRadius: 20)
                            .strokeBorder(selected ? StudioStyle.accent : Color.primary.opacity(0.1), lineWidth: selected ? 2 : 1)
                    }
                HStack(spacing: 10) {
                    Image(systemName: mode == "light" ? "sun.max" : mode == "dark" ? "moon" : "desktopcomputer")
                        .font(.body).foregroundStyle(.secondary)
                    Text(mode.capitalized).font(.headline)
                    Spacer()
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(selected ? StudioStyle.accent : Color.secondary.opacity(0.5))
                }.padding(.horizontal, 4)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(mode.capitalized) appearance")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
