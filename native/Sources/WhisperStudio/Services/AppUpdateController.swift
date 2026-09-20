import AppKit
import CryptoKit
import Foundation
import UserNotifications

@MainActor @Observable
final class AppUpdateController {
    static let feedURL = URL(string: "https://transcribe.bernardyamoah.com/api/releases/latest")!

    private(set) var phase: AppUpdatePhase = .idle
    private(set) var latest: AppRelease?
    private(set) var lastChecked: Date?

    var updateAvailable: Bool {
        switch phase {
        case .available, .downloading, .ready: true
        default: false
        }
    }

    var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    func check(manual: Bool = false) async {
        guard phase != .checking, phase != .downloading else { return }
        phase = .checking
        do {
            var request = URLRequest(url: Self.feedURL)
            request.timeoutInterval = 15
            request.cachePolicy = manual ? .reloadIgnoringLocalCacheData : .useProtocolCachePolicy
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw UpdateFailure("The update server is unavailable.")
            }
            let release = try Self.decoder.decode(AppRelease.self, from: data)
            latest = release
            lastChecked = .now
            phase = release.version.compare(currentVersion, options: .numeric) == .orderedDescending
                ? .available : .current
            if updateAvailable && UserDefaults.standard.bool(forKey: "automaticallyDownloadUpdates") {
                await download()
            }
        } catch {
            phase = .failed(error.localizedDescription)
            if manual { await notify(title: "Unable to check for updates", body: error.localizedDescription) }
        }
    }

    func download() async {
        guard let latest, updateAvailable else { return }
        guard latest.downloadURL.scheme == "https",
              latest.downloadURL.host == Self.feedURL.host,
              latest.filename == URL(filePath: latest.filename).lastPathComponent,
              latest.filename.hasSuffix(".dmg") else {
            phase = .failed("The update information is invalid.")
            return
        }
        phase = .downloading
        do {
            let (temporary, response) = try await URLSession.shared.download(from: latest.downloadURL)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw UpdateFailure("The update could not be downloaded.")
            }
            let attributes = try FileManager.default.attributesOfItem(atPath: temporary.path)
            let downloadedSize = (attributes[.size] as? NSNumber)?.int64Value
            guard downloadedSize == latest.sizeBytes else {
                throw UpdateFailure("The update download was incomplete. Please try again.")
            }
            if let expected = latest.sha256 {
                let actual = try await Self.checksum(of: temporary)
                guard actual.caseInsensitiveCompare(expected) == .orderedSame else {
                    throw UpdateFailure("The downloaded update did not pass its integrity check.")
                }
            }
            let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
            let destination = Self.availableDestination(in: downloads, filename: latest.filename)
            try FileManager.default.moveItem(at: temporary, to: destination)
            phase = .ready(destination)
            await notify(title: "Whisper Studio update downloaded", body: "Version \(latest.version) is ready to install.")
        } catch {
            phase = .failed(error.localizedDescription)
            await notify(title: "Update download failed", body: error.localizedDescription)
        }
    }

    func openInstaller() {
        guard case .ready(let url) = phase else { return }
        NSWorkspace.shared.open(url)
    }

    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private static func availableDestination(in directory: URL, filename: String) -> URL {
        let source = URL(filePath: filename)
        var candidate = directory.appending(path: filename)
        var index = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = directory.appending(path: "\(source.deletingPathExtension().lastPathComponent) \(index).dmg")
            index += 1
        }
        return candidate
    }

    nonisolated private static func checksum(of url: URL) async throws -> String {
        try await Task.detached(priority: .utility) {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            var hash = SHA256()
            while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty { hash.update(data: data) }
            return hash.finalize().map { String(format: "%02x", $0) }.joined()
        }.value
    }

    private func notify(title: String, body: String) async {
        let center = UNUserNotificationCenter.current()
        _ = try? await center.requestAuthorization(options: [.alert, .sound])
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        try? await center.add(request)
    }
}

private struct UpdateFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
