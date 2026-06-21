import 'package:flutter/material.dart';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

class DocumentScannerScreen extends StatefulWidget {
  const DocumentScannerScreen({super.key});

  @override
  State<DocumentScannerScreen> createState() => _DocumentScannerScreenState();
}

class _DocumentScannerScreenState extends State<DocumentScannerScreen> {
  CameraController? _cameraController;
  List<CameraDescription> _cameras = [];
  bool _isInitialized = false;
  bool _isProcessing = false;
  XFile? _capturedImage;
  String _extractedText = '';
  bool _showResults = false;
  final TextRecognizer _textRecognizer = TextRecognizer();

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    _cameras = await availableCameras();
    if (_cameras.isEmpty) return;

    _cameraController = CameraController(
      _cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => _cameras.first,
      ),
      ResolutionPreset.high,
      enableAudio: false,
    );

    await _cameraController!.initialize();
    if (mounted) {
      setState(() => _isInitialized = true);
    }
  }

  Future<void> _captureDocument() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;

    setState(() => _isProcessing = true);

    try {
      final image = await _cameraController!.takePicture();
      setState(() {
        _capturedImage = image;
        _isProcessing = false;
      });
      await _processOCR(image);
    } catch (e) {
      setState(() => _isProcessing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    }
  }

  Future<void> _processOCR(XFile image) async {
    setState(() => _isProcessing = true);

    try {
      final inputImage = InputImage.fromFilePath(image.path);
      final recognizedText = await _textRecognizer.processImage(inputImage);

      setState(() {
        _extractedText = recognizedText.text;
        _showResults = true;
        _isProcessing = false;
      });
    } catch (e) {
      setState(() => _isProcessing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('OCR Error: $e')),
      );
    }
  }

  void _reset() {
    setState(() {
      _capturedImage = null;
      _extractedText = '';
      _showResults = false;
    });
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _textRecognizer.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_showResults) {
      return _buildResultsView();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Document Scanner'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () {},
          ),
        ],
      ),
      body: _isInitialized
          ? Stack(
              fit: StackFit.expand,
              children: [
                CameraPreview(_cameraController!),
                // Document frame overlay
                Center(
                  child: Container(
                    width: MediaQuery.of(context).size.width * 0.85,
                    height: MediaQuery.of(context).size.width * 1.1,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: Colors.white,
                        width: 2,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Corner markers
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _buildCorner(true, true),
                            _buildCorner(false, true),
                          ],
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _buildCorner(true, false),
                            _buildCorner(false, false),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                // Bottom tip
                Positioned(
                  bottom: 120,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        'Place document within frame',
                        style: TextStyle(color: Colors.white, fontSize: 14),
                      ),
                    ),
                  ),
                ),
              ],
            )
          : const Center(child: CircularProgressIndicator()),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _isProcessing
                ? const CircularProgressIndicator()
                : FloatingActionButton.large(
                    onPressed: _captureDocument,
                    child: const Icon(Icons.camera_alt, size: 32),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _buildCorner(bool left, bool top) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        border: Border(
          left: left ? const BorderSide(color: Colors.blue, width: 3) : BorderSide.none,
          right: !left ? const BorderSide(color: Colors.blue, width: 3) : BorderSide.none,
          top: top ? const BorderSide(color: Colors.blue, width: 3) : BorderSide.none,
          bottom: !top ? const BorderSide(color: Colors.blue, width: 3) : BorderSide.none,
        ),
      ),
    );
  }

  Widget _buildResultsView() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanned Document'),
        actions: [
          IconButton(
            icon: const Icon(Icons.copy),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Text copied to clipboard')),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_capturedImage != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(
                  File(_capturedImage!.path),
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(height: 16),
            ],
            Text(
              'Extracted Text',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            if (_isProcessing)
              const Center(child: CircularProgressIndicator())
            else if (_extractedText.isEmpty)
              const Text('No text found in image')
            else
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: SelectableText(_extractedText),
              ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _reset,
                icon: const Icon(Icons.camera_alt),
                label: const Text('Scan Again'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: _extractedText.isNotEmpty ? () {} : null,
                icon: const Icon(Icons.save),
                label: const Text('Save as PDF'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
