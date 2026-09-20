import Foundation

@MainActor
final class StudioAPI {
    let base: URL
    init(base: URL) { self.base = base }

    func url(_ path: String) -> URL {
        guard let value = URL(string: "api/" + path, relativeTo: base.appending(path: "/")) else {
            preconditionFailure("Invalid internal API route")
        }
        return value.absoluteURL
    }

    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> T {
        var request = URLRequest(url: url(path))
        request.httpMethod = method
        request.timeoutInterval = 120
        request.setValue("1", forHTTPHeaderField: "X-Studio-Request")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(data, response)
        return try Self.decoder.decode(T.self, from: data)
    }

    func mutate(_ path: String, method: String = "POST", body: [String: Any] = [:]) async throws {
        var request = URLRequest(url: url(path))
        request.httpMethod = method
        request.setValue("1", forHTTPHeaderField: "X-Studio-Request")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 120
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(data, response)
    }

    func upload(_ file: URL) async throws -> ImportedMedia {
        let scoped = file.startAccessingSecurityScopedResource()
        defer { if scoped { file.stopAccessingSecurityScopedResource() } }
        var request = URLRequest(url: url("media"))
        request.httpMethod = "POST"
        request.timeoutInterval = 3600
        request.setValue("1", forHTTPHeaderField: "X-Studio-Request")
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue(file.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed), forHTTPHeaderField: "X-Filename")
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: file)
        try validate(data, response)
        return try Self.decoder.decode(ImportedMedia.self, from: data)
    }

    func download(_ path: String, to destination: URL) async throws {
        let (temporary, response) = try await URLSession.shared.download(from: url(path))
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw StudioFailure(message: "Export failed. Please try again.")
        }
        let data = try Data(contentsOf: temporary)
        try data.write(to: destination, options: .atomic)
    }

    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    func validate(_ data: Data, _ response: URLResponse) throws {
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw StudioFailure(message: value?["detail"] as? String ?? "The local service could not complete this request.")
        }
    }
}
