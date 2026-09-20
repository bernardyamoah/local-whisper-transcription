import SwiftUI

struct ExportChoice: View {
    let title: String
    let subtitle: String
    let symbol: String
    var platform: String? = nil
    let selected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Group {
                    if let platform { PlatformIcon(name: platform, size: 25) }
                    else { Image(systemName: symbol).font(.title3) }
                }.frame(width: 38, height: 38)
                    .background(.primary.opacity(0.05), in: .rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.callout.weight(.semibold))
                    Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 4)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Color.primary : .secondary)
            }
            .padding(12).frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
            .background(.primary.opacity(selected ? 0.09 : 0.025), in: .rect(cornerRadius: 14))
            .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(.primary.opacity(selected ? 0.35 : 0.09)) }
            .contentShape(.rect(cornerRadius: 14))
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }
}
