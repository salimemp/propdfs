import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/accessibility/voice_service.dart';

class AIChatScreen extends ConsumerStatefulWidget {
  final String? documentId;
  const AIChatScreen({super.key, this.documentId});

  @override
  ConsumerState<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends ConsumerState<AIChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<_ChatMessage> _messages = [];
  _PickedDoc? _pickedDoc;
  bool _isSending = false;

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _pickDocument() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'txt'],
      withData: true,
    );
    if (result == null || result.files.single.bytes == null) return;

    setState(() {
      _pickedDoc = _PickedDoc(
        name: result.files.single.name,
        size: result.files.single.size,
        bytes: result.files.single.bytes!,
      );
      _messages.clear();
    });
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    if (_pickedDoc == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please pick a document first.')),
      );
      return;
    }

    setState(() {
      _messages.add(_ChatMessage(role: 'user', text: text));
      _isSending = true;
    });
    _messageController.clear();
    _scrollToBottom();

    try {
      final dio = ref.read(apiClientProvider);
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          _pickedDoc!.bytes,
          filename: _pickedDoc!.name,
          contentType: DioMediaType('application', 'pdf'),
        ),
        'request': MultipartFile.fromString(
          _buildChatJson(text),
          contentType: DioMediaType('application', 'json'),
        ),
      });

      final resp = await dio.post('/api/v1/ai/chat', data: form);
      final answer = resp.data['answer'] as String? ??
          resp.data['text'] as String? ??
          'I was unable to answer that question.';

      if (mounted) {
        setState(() {
          _messages.add(_ChatMessage(role: 'assistant', text: answer));
          _isSending = false;
        });
        _scrollToBottom();
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _isSending = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?['detail'] ?? e.message ?? 'AI chat failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSending = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI chat failed: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  String _buildChatJson(String question) {
    final history = _messages
        .where((m) => m.role == 'user' || m.role == 'assistant')
        .map((m) => '{"role":"${m.role}","content":${_escape(m.text)}}')
        .toList();
    final historyJson = history.join(',');
    return '{"question":${_escape(question)},"chat_history":[$historyJson]}';
  }

  String _escape(String s) {
    final escaped = s
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r')
        .replaceAll('\t', '\\t');
    return '"$escaped"';
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _speakMessage(String text) async {
    final voiceService = ref.read(voiceServiceProvider);
    await voiceService.speak(text);
  }

  void _copyMessage(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Copied to clipboard')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('ai_chat')),
        actions: [
          IconButton(
            tooltip: 'Pick document',
            icon: const Icon(Icons.attach_file),
            onPressed: _pickDocument,
          ),
        ],
      ),
      body: Column(
        children: [
          // Document header (chosen document)
          Container(
            padding: const EdgeInsets.all(12),
            color: Theme.of(context).colorScheme.primaryContainer.withOpacity(0.3),
            child: Row(
              children: [
                Icon(Icons.description, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _pickedDoc != null
                        ? 'Chatting about: ${_pickedDoc!.name}'
                        : 'No document picked — tap the paperclip to choose a PDF',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.primary,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (_pickedDoc != null)
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => setState(() => _pickedDoc = null),
                  ),
              ],
            ),
          ),

          // Messages
          Expanded(
            child: _messages.isEmpty
                ? _buildEmptyState()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) =>
                        _buildMessageBubble(_messages[index]),
                  ),
          ),

          // Loading indicator
          if (_isSending)
            Container(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    l10n.get('ai_thinking'),
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),

          // Input
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border(top: BorderSide(color: Colors.grey[200]!)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: InputDecoration(
                      hintText: l10n.get('ask_question'),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                      filled: true,
                      fillColor:
                          Theme.of(context).colorScheme.surfaceContainerHighest,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.send),
                  onPressed: _isSending ? null : _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.auto_awesome, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'Ask AI about your document',
            style: TextStyle(color: Colors.grey[500], fontSize: 16),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              _buildSuggestionChip('Summarize this document'),
              _buildSuggestionChip('What are the key points?'),
              _buildSuggestionChip('Extract all data'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestionChip(String text) {
    return ActionChip(
      label: Text(text),
      onPressed: () {
        if (_pickedDoc == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Pick a document first.')),
          );
          return;
        }
        _messageController.text = text;
        _sendMessage();
      },
    );
  }

  Widget _buildMessageBubble(_ChatMessage msg) {
    final isUser = msg.role == 'user';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 16,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: Icon(
                Icons.auto_awesome,
                size: 16,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isUser
                    ? Theme.of(context).colorScheme.primary
                    : Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(
                    msg.text,
                    style: TextStyle(color: isUser ? Colors.white : null),
                  ),
                  if (!isUser)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.copy, size: 16),
                          onPressed: () => _copyMessage(msg.text),
                        ),
                        IconButton(
                          icon: const Icon(Icons.volume_up, size: 16),
                          onPressed: () => _speakMessage(msg.text),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            CircleAvatar(
              radius: 16,
              backgroundColor: Theme.of(context).colorScheme.primary,
              child: const Icon(Icons.person, size: 16, color: Colors.white),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChatMessage {
  final String role; // 'user' | 'assistant'
  final String text;

  _ChatMessage({required this.role, required this.text});
}

class _PickedDoc {
  final String name;
  final int size;
  final List<int> bytes;

  _PickedDoc({required this.name, required this.size, required this.bytes});
}
