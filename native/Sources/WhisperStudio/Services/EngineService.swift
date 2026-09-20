import Foundation

@MainActor
final class EngineService {
    private var process: Process?
    private var readyFile: URL?
    private var log: FileHandle?

    func start() async throws -> URL {
        if let override = ProcessInfo.processInfo.environment["STUDIO_API_URL"], let url = URL(string: override),
           ["127.0.0.1", "localhost"].contains(url.host) { return url }
        let ready = FileManager.default.temporaryDirectory.appending(path: "whisper-service-\(UUID().uuidString).json")
        readyFile = ready
        let worker = Process()
        var environment = ProcessInfo.processInfo.environment
        if let root = environment["STUDIO_PROJECT_ROOT"] {
            worker.executableURL = URL(filePath: root).appending(path: ".venv/bin/python")
            worker.arguments = ["-m", "studio.service", "--ready-file", ready.path]
            worker.currentDirectoryURL = URL(filePath: root)
        } else {
            guard let resources = Bundle.main.resourceURL else { throw StudioFailure(message: "The app resources are missing.") }
            worker.executableURL = resources.appending(path: "Engine/Whisper Studio Service")
            worker.arguments = ["--ready-file", ready.path]
        }
        let root = environment["STUDIO_DATA"].map { URL(filePath: $0) }
            ?? URL.applicationSupportDirectory.appending(path: "Whisper Studio")
        environment["STUDIO_DATA"] = root.path
        worker.environment = environment
        try FileManager.default.createDirectory(at: root.appending(path: "logs"), withIntermediateDirectories: true)
        let logURL = root.appending(path: "logs/native-service.log")
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        let output = try FileHandle(forWritingTo: logURL)
        try output.seekToEnd()
        log = output
        worker.standardError = output
        worker.standardOutput = output
        try worker.run()
        process = worker
        for _ in 0..<300 {
            try Task.checkCancellation()
            guard worker.isRunning else { throw StudioFailure(message: "The transcription engine could not start. Quit any other copy of Whisper Studio, then retry.") }
            if let data = try? Data(contentsOf: ready),
               let object = try? JSONSerialization.jsonObject(with: data) as? [String: String],
               let value = object["url"], let url = URL(string: value) { return url }
            try await Task.sleep(for: .milliseconds(100))
        }
        stop()
        throw StudioFailure(message: "The transcription engine took too long to start.")
    }

    func stop() {
        if process?.isRunning == true { process?.terminate() }
        process = nil
        if let readyFile { try? FileManager.default.removeItem(at: readyFile) }
        try? log?.close()
        log = nil
    }
}
