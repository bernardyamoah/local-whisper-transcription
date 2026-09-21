// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "WhisperStudioAudioBridge",
    platforms: [.macOS(.v26)],
    products: [
        .executable(name: "whisper-studio-audio-bridge", targets: ["AudioBridge"]),
        .executable(name: "WhisperStudio", targets: ["WhisperStudio"]),
    ],
    targets: [
        .executableTarget(name: "AudioBridge", swiftSettings: [.swiftLanguageMode(.v5)]),
        .executableTarget(name: "WhisperStudio", resources: [.copy("Resources/BrandIcons"), .copy("Resources/Welcome")]),
        .testTarget(name: "WhisperStudioTests", dependencies: ["WhisperStudio"]),
    ],
    swiftLanguageModes: [.v6]
)
