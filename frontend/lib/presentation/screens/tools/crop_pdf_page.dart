import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../widgets/backend_tool_scaffold.dart';

/// Crop every page of a PDF by trimming margins (top / right / bottom /
/// left, in PDF user units — 72 = 1 inch). Backend task type is
/// "crop", which calls pikepdf's MediaBox rewrite on every page.
class CropPdfPage extends ConsumerStatefulWidget {
  const CropPdfPage({super.key});

  @override
  ConsumerState<CropPdfPage> createState() => _CropPdfPageState();
}

class _CropPdfPageState extends ConsumerState<CropPdfPage> {
  final _top = TextEditingController(text: '36');
  final _right = TextEditingController(text: '36');
  final _bottom = TextEditingController(text: '36');
  final _left = TextEditingController(text: '36');

  @override
  void dispose() {
    _top.dispose();
    _right.dispose();
    _bottom.dispose();
    _left.dispose();
    super.dispose();
  }

  double? _parse(TextEditingController c) {
    final v = double.tryParse(c.text.trim());
    if (v == null || v < 0) return null;
    return v;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/tools'),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.catEdit.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.crop,
                size: 18,
                color: AppColors.catEdit,
              ),
            ),
            const SizedBox(width: 10),
            const Text('Crop PDF'),
          ],
        ),
      ),
      body: BackendToolScaffold(
        accent: AppColors.catEdit,
        taskType: 'crop',
        pickLabel: 'Choose a PDF to crop',
        ctaLabel: 'Crop PDF',
        busyLabel: 'Cropping...',
        ctaHint:
            'Margins are in PDF points (72 = 1 inch). The same trim is '
            'applied to every page. Pick smaller values to keep more of '
            'the page, larger ones to remove more.',
        buildParams: () {
          final m = {
            'top': _parse(_top) ?? 0,
            'right': _parse(_right) ?? 0,
            'bottom': _parse(_bottom) ?? 0,
            'left': _parse(_left) ?? 0,
          };
          if (m.values.every((v) => v == 0)) {
            throw Exception('Enter at least one non-zero margin to crop.');
          }
          return {'margins': m};
        },
        form: _buildForm(),
      ),
    );
  }

  Widget _buildForm() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Trim margins (in points)',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 16),
          _marginField(_top, 'Top'),
          _marginField(_right, 'Right'),
          _marginField(_bottom, 'Bottom'),
          _marginField(_left, 'Left'),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _presetChip('No trim', {'top': 0, 'right': 0, 'bottom': 0, 'left': 0}),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _presetChip(
                  'Quarter inch',
                  {'top': 18, 'right': 18, 'bottom': 18, 'left': 18},
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _presetChip(
                  'Half inch',
                  {'top': 36, 'right': 36, 'bottom': 36, 'left': 36},
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _marginField(TextEditingController c, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          labelText: label,
          suffixText: 'pt',
          border: const OutlineInputBorder(),
          filled: true,
          fillColor: Colors.white,
        ),
        onChanged: (_) => setState(() {}),
      ),
    );
  }

  Widget _presetChip(String label, Map<String, num> values) {
    return OutlinedButton(
      onPressed: () {
        setState(() {
          _top.text = values['top'].toString();
          _right.text = values['right'].toString();
          _bottom.text = values['bottom'].toString();
          _left.text = values['left'].toString();
        });
      },
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 10),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}
