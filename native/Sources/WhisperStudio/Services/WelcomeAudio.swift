import AVFoundation
import Observation

@MainActor @Observable
final class WelcomeAudio {
    let enabled = true
    private(set) var musicEnabled = true
    private var player: AVAudioPlayer?
    private var music: AVAudioPlayer?

    func play(_ name: String, at time: TimeInterval = 0) {
        stop()
        guard enabled, let url = asset(name, extension: "wav"),
              let audio = try? AVAudioPlayer(contentsOf: url) else { return }
        player = audio
        audio.volume = name == "arrival" ? 0.55 : 0.85
        audio.currentTime = time
        audio.play()
        if name == "sample" { music?.setVolume(0.045, fadeDuration: 0.25) }
    }

    func startMusic() {
        if music == nil, let url = asset("ambient", extension: "m4a") {
            music = try? AVAudioPlayer(contentsOf: url)
            music?.numberOfLoops = -1
            music?.volume = 0
        }
        music?.play()
        music?.setVolume(player?.isPlaying == true ? 0.045 : 0.14, fadeDuration: 1)
    }

    var position: TimeInterval? {
        guard let player else { return nil }
        return player.isPlaying ? player.currentTime : player.duration
    }
    func stop() {
        player?.stop(); player = nil
        if musicEnabled { music?.setVolume(0.14, fadeDuration: 0.6) }
    }
    func suspend(_ value: Bool) {
        stop()
        if value { music?.pause() }
        else if musicEnabled { music?.play() }
    }
    func stopAll() {
        stop(); music?.stop(); music = nil
    }
    private func asset(_ name: String, extension ext: String) -> URL? {
        if let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Welcome") { return url }
        #if DEBUG
        return URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "Resources/Welcome/\(name).\(ext)")
        #else
        return nil
        #endif
    }
}
