import SwiftUI

struct PlatformIcon: View {
    let name: String
    var size: CGFloat = 28
    private var image: NSImage? {
        guard ["notion", "obsidian"].contains(name) else { return nil }
        if let url = Bundle.main.url(forResource: name, withExtension: "svg", subdirectory: "BrandIcons") {
            return NSImage(contentsOf: url)
        }
        #if DEBUG
        let url = URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "Resources/BrandIcons/\(name).svg")
        return NSImage(contentsOf: url)
        #else
        return nil
        #endif
    }
    var body: some View {
        Group {
            if let image {
                Image(nsImage: image).resizable()
                    .renderingMode(name == "notion" ? .template : .original)
                    .scaledToFit()
            } else {
                Image(systemName: name == "file" ? "folder" : name == "deepgram" ? "waveform" : name == "jev" ? "sparkles" : "arrow.triangle.branch")
                    .resizable().scaledToFit()
            }
        }.frame(width: size, height: size).accessibilityHidden(true)
    }
}
