import SwiftUI
import AVKit

@MainActor @Observable
final class PlaybackController {
    let player = AVPlayer()
    var time = 0.0
    var duration = 1.0
    var playing = false
    var speed: Float = 1
    var error: String?

    func load(_ url: URL, duration: Double) {
        self.duration = max(1, duration)
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
    }
    func toggle() {
        if player.timeControlStatus == .playing { player.pause() }
        else { player.playImmediately(atRate: speed) }
        playing = player.timeControlStatus != .paused
    }
    func seek(_ value: Double) {
        time = min(max(value, 0), duration)
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }
    func setSpeed() { if playing { player.rate = speed } }
    func monitor() async {
        while !Task.isCancelled {
            let value = player.currentTime().seconds
            if value.isFinite { time = value }
            playing = player.timeControlStatus == .playing
            if let failure = player.currentItem?.error { error = failure.localizedDescription }
            do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
        }
    }
    func stop() { player.pause(); playing = false }
}
