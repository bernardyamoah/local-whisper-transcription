import SwiftUI

struct Surface<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content.padding(StudioStyle.spacing)
            .background(.primary.opacity(0.035), in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(.primary.opacity(0.08), lineWidth: 0.5)
            }
    }
}
