import SwiftUI

struct Surface<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content.padding(StudioStyle.spacing)
            .studioGlass(radius: 18)
    }
}
