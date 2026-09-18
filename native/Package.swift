// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "WhisperStudioAudioBridge",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "whisper-studio-audio-bridge", targets: ["AudioBridge"]),
    ],
    targets: [
        .executableTarget(name: "AudioBridge"),
    ],
    swiftLanguageModes: [.v5]
)
