import Foundation

enum JSONLine {
    private static let lock = NSLock()

    static func write(_ value: [String: Any], to handle: FileHandle = .standardOutput) {
        guard var data = try? JSONSerialization.data(withJSONObject: value) else { return }
        data.append(0x0A)
        lock.lock()
        handle.write(data)
        lock.unlock()
    }

    static func error(_ message: String) {
        write(["type": "error", "message": message], to: .standardError)
    }
}
