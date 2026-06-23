// Real implementation for Flutter Web. The Dart VM in `flutter test`
// (which runs on the host) doesn't have access to dart:js_interop,
// so we keep the web-only code here and route to it via a
// conditional import in [web_bridge.dart].

import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

/// Thin wrapper around the `window.propdfs.*` JS shim declared in
/// `web/propdfs_shim.js`. The shim knows about browser APIs; this
/// wrapper just marshals arguments and converts JS values back into
/// Dart types.
class WebBridge {
  WebBridge._();

  /// Trigger a browser download of [bytes] as [filename].
  static void downloadBytes(
    Uint8List bytes,
    String filename, {
    String mimeType = 'application/octet-stream',
  }) {
    if (!kIsWeb) return;
    try {
      final shim = _propdfs;
      if (shim == null) return;
      shim.callMethodVarArgs<JSAny?>(
        'download'.toJS,
        <JSAny?>[bytes.toJS, filename.toJS, mimeType.toJS],
      );
    } catch (e) {
      // ignore: avoid_print
      print('[WebBridge] download failed: $e');
    }
  }

  /// Run Tesseract.js on an image and return recognised text + word boxes.
  static Future<OcrResult> ocrImage(
    String imageDataUrl, {
    String lang = 'eng',
  }) async {
    if (!kIsWeb) {
      throw UnsupportedError('OCR runs in the browser via Tesseract.js.');
    }
    final shim = _propdfs;
    if (shim == null) {
      throw StateError(
        'window.propdfs is undefined. Did web/propdfs_shim.js load? '
        'Check that index.html includes <script src="propdfs_shim.js"> '
        'BEFORE flutter_bootstrap.js.',
      );
    }
    final raw = await (shim.callMethodVarArgs<JSPromise<JSAny?>>(
      'ocr'.toJS,
      <JSAny?>[imageDataUrl.toJS, lang.toJS],
    )).toDart;
    return OcrResult.fromJs(raw);
  }

  /// Tear down the cached Tesseract worker.
  static Future<void> terminateOcr() async {
    if (!kIsWeb) return;
    final shim = _propdfs;
    if (shim == null) return;
    try {
      await (shim.callMethodVarArgs<JSPromise<JSAny?>>(
        'ocrTerminate'.toJS,
        const <JSAny?>[],
      )).toDart;
    } catch (_) {
      // Worker already torn down — ignore.
    }
  }
}

/// OCR result from Tesseract.js — full text + per-word boxes.
class OcrResult {
  final String text;
  final List<OcrWordBlock> blocks;

  const OcrResult({required this.text, required this.blocks});

  factory OcrResult.fromJs(JSAny? raw) {
    if (raw == null) return const OcrResult(text: '', blocks: []);
    final map = raw.dartify() as Map<Object?, Object?>?;
    if (map == null) return const OcrResult(text: '', blocks: []);

    final text = (map['text'] as String?) ?? '';
    final rawBlocks = map['blocks'];
    final blocks = <OcrWordBlock>[];
    if (rawBlocks is List) {
      for (final item in rawBlocks) {
        if (item is! Map) continue;
        final w = item['text'];
        final bb = item['bbox'];
        if (w is! String || w.trim().isEmpty || bb is! Map) continue;
        blocks.add(OcrWordBlock(
          text: w,
          x: _toDouble(bb['x']),
          y: _toDouble(bb['y']),
          w: _toDouble(bb['w']),
          h: _toDouble(bb['h']),
        ));
      }
    }
    return OcrResult(text: text, blocks: blocks);
  }

  static double _toDouble(Object? v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0;
    return 0;
  }
}

/// One recognised word with a bounding box.
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

@JS('window.propdfs')
external JSObject? get _propdfs;
