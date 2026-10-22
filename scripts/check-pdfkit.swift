// Opens PDFs with Apple's PDFKit — the engine behind macOS Preview and the
// iPhone/iPad Files app — and reports what it sees, as JSON:
// form field values, page text, and a PNG of each first page.
//
//   swift scripts/check-pdfkit.swift <out-dir> <file.pdf> [password] ...
//
// Used by src/pdf/viewers.test.ts on macOS (skipped elsewhere).
import AppKit
import Foundation
import PDFKit

struct FieldReport: Encodable {
    let name: String
    let type: String
    let value: String
    let page: Int
}

struct FileReport: Encodable {
    let file: String
    let opened: Bool
    let locked: Bool
    let pages: Int
    let fields: [FieldReport]
    let text: [String]
    let png: String?
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: check-pdfkit.swift <out-dir> <file.pdf>[::password] ...\n".data(using: .utf8)!)
    exit(2)
}
let outDir = URL(fileURLWithPath: args[0])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

var reports: [FileReport] = []
for arg in args.dropFirst() {
    let parts = arg.components(separatedBy: "::")
    let url = URL(fileURLWithPath: parts[0])
    guard let doc = PDFDocument(url: url) else {
        reports.append(FileReport(file: url.lastPathComponent, opened: false, locked: false, pages: 0, fields: [], text: [], png: nil))
        continue
    }
    if doc.isLocked, parts.count > 1 { _ = doc.unlock(withPassword: parts[1]) }
    var fields: [FieldReport] = []
    var text: [String] = []
    for i in 0..<doc.pageCount {
        guard let page = doc.page(at: i) else { continue }
        text.append(page.string ?? "")
        for a in page.annotations where a.type == "Widget" {
            let name = a.fieldName ?? ""
            switch a.widgetFieldType {
            case .button:
                let isRadio = a.widgetControlType == .radioButtonControl
                fields.append(FieldReport(name: name, type: isRadio ? "radio" : "checkbox",
                                          value: a.buttonWidgetState == .onState ? (a.buttonWidgetStateString.isEmpty ? "on" : a.buttonWidgetStateString) : "off",
                                          page: i))
            case .choice:
                fields.append(FieldReport(name: name, type: "choice", value: a.widgetStringValue ?? "", page: i))
            case .text:
                fields.append(FieldReport(name: name, type: "text", value: a.widgetStringValue ?? "", page: i))
            case .signature:
                fields.append(FieldReport(name: name, type: "signature", value: "", page: i))
            default:
                break
            }
        }
    }
    var pngName: String? = nil
    if let page = doc.page(at: 0) {
        let bounds = page.bounds(for: .cropBox)
        let size = page.rotation % 180 == 0 ? bounds.size : CGSize(width: bounds.height, height: bounds.width)
        let image = page.thumbnail(of: CGSize(width: size.width * 1.5, height: size.height * 1.5), for: .cropBox)
        if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
            let name = url.deletingPathExtension().lastPathComponent + ".pdfkit.png"
            try? png.write(to: outDir.appendingPathComponent(name))
            pngName = name
        }
    }
    reports.append(FileReport(file: url.lastPathComponent, opened: true, locked: doc.isLocked, pages: doc.pageCount,
                              fields: fields, text: text, png: pngName))
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(reports))
