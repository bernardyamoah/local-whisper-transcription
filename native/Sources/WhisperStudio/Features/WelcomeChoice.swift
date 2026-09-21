import SwiftUI

struct WelcomeChoice: View {
    let title: String
    let subtitle: String
    let icon: String
    let selected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: icon).font(.title2)
                    Spacer()
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? Color.accentColor : .secondary)
                }
                Text(title).font(.headline)
                if !subtitle.isEmpty { Text(subtitle).font(.callout).foregroundStyle(.secondary) }
            }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 22))
                .overlay { RoundedRectangle(cornerRadius: 22).strokeBorder(selected ? Color.accentColor.opacity(0.7) : .primary.opacity(0.08)) }
                .contentShape(.rect(cornerRadius: 22))
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }
}
