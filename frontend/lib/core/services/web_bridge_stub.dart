// Stub for non-web platforms. The real implementation lives in
// `web_bridge_web.dart` and is exported via a conditional import
// below. On native (iOS / Android / desktop) every method is a no-op
// or throws `UnsupportedError` for things that genuinely need the
// browser.

class OcrResult {
  final String text;
  final List<OcrWordBlock> blocks;
  const OcrResult({required this.text, required this.blocks});
}

class OcrWordBlock {
  final String text;
  final double x;
  final double y;
  final double w;
  final double h;
  const OcrWordBlock({
    required this.text,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
  });
}

class WebBridge {
  WebBridge._();

  static void downloadBytes(
    Object bytes,
    String filename, {
    String mimeType = 'application/octet-stream',
  }) {
    // No-op on native. Use path_provider + share_plus if you need to
    // hand the file to the OS share sheet.
  }

  static Future<OcrResult> ocrImage(
    String imageDataUrl, {
    String lang = 'eng',
  }) async {
    throw UnsupportedError(
      'OCR currently runs in the browser only. '
      'Open the web app at https://app.getpdfpro.com/tools/ocr.',
    );
  }

  static Future<void> terminateOcr() async {}
}
