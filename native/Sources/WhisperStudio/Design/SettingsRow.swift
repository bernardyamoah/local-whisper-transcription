import SwiftUI

struct SettingsRow<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        HStack(spacing: 24) {
            Text(title).font(.body)
            Spacer(minLength: 20)
            content.labelsHidden().fixedSize().accessibilityLabel(title)
        }.frame(minHeight: 28)
    }
}
