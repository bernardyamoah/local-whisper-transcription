import SwiftUI

struct SidebarItem: View {
    let title: String
    let icon: String
    let selected: Bool
    var badge = false
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Image(systemName: icon).font(.system(size: 16, weight: .medium)).frame(width: 21)
                Text(title).font(.system(size: 13, weight: selected ? .semibold : .medium)).lineLimit(1)
                Spacer(minLength: 0)
                if badge {
                    Image(systemName: "arrow.down.circle.fill").foregroundStyle(StudioStyle.accent)
                        .accessibilityLabel("Update available")
                } else if selected { Circle().fill(.primary.opacity(0.7)).frame(width: 4, height: 4) }
            }
            .foregroundStyle(selected ? .primary : .secondary)
            .padding(.horizontal, 12).frame(height: 42)
            .background(.primary.opacity(selected ? 0.095 : hovering ? 0.045 : 0), in: .rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(.primary.opacity(selected ? 0.08 : 0)) }
            .contentShape(.rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
