import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/api_client.dart';

class BlogScreen extends ConsumerStatefulWidget {
  const BlogScreen({super.key});

  @override
  ConsumerState<BlogScreen> createState() => _BlogScreenState();
}

class _BlogScreenState extends ConsumerState<BlogScreen> {
  bool _isLoading = true;
  String? _error;
  List<_BlogPost> _posts = [];
  List<_BlogCategory> _categories = [];
  String? _selectedCategory;
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await Future.wait([_loadCategories(), _loadPosts()]);
  }

  Future<void> _loadCategories() async {
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.get('/api/v1/blog/categories');
      final items = (resp.data as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>();
      if (mounted) {
        setState(() {
          _categories = items
              .map((j) => _BlogCategory(
                    name: j['name'] as String? ?? 'uncategorized',
                    count: (j['count'] as num?)?.toInt() ?? 0,
                  ))
              .toList();
        });
      }
    } catch (_) {
      // Categories are decorative — ignore failures.
    }
  }

  Future<void> _loadPosts() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.get(
        '/api/v1/blog/posts',
        queryParameters: {
          if (_selectedCategory != null) 'category': _selectedCategory,
          if (_searchQuery.isNotEmpty) 'search': _searchQuery,
          'page': 1,
          'page_size': 50,
        },
      );
      final items = (resp.data as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _posts = items.map(_BlogPost.fromJson).toList();
        _isLoading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.data?['detail'] ?? e.message ?? 'Failed to load blog';
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceLight,
        elevation: 0,
        foregroundColor: AppColors.textLight,
        title: const Text(
          'Blog',
          style: TextStyle(
            color: AppColors.textLight,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.textLight),
            onPressed: _isLoading ? null : _loadPosts,
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                fillColor: AppColors.surfaceMutedLight,
                filled: true,
                hintText: 'Search articles...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                          _loadPosts();
                        },
                      ),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onSubmitted: (v) {
                setState(() => _searchQuery = v);
                _loadPosts();
              },
            ),
          ),
          // Category chips
          if (_categories.isNotEmpty)
            SizedBox(
              height: 50,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: const Text('All'),
                      selected: _selectedCategory == null,
                      onSelected: (_) {
                        setState(() => _selectedCategory = null);
                        _loadPosts();
                      },
                    ),
                  ),
                  ..._categories.map((c) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text('${c.name} (${c.count})'),
                          selected: _selectedCategory == c.name,
                          onSelected: (_) {
                            setState(
                                () => _selectedCategory = _selectedCategory == c.name ? null : c.name);
                            _loadPosts();
                          },
                        ),
                      )),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(
                        color: AppColors.primaryLight))
                : _error != null
                    ? _BlogComingSoon(onRetry: _loadPosts)
                    : _posts.isEmpty
                        ? const _BlogComingSoon()
                        : RefreshIndicator(
                            onRefresh: _loadPosts,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _posts.length,
                              itemBuilder: (context, index) {
                                final p = _posts[index];
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  child: InkWell(
                                    onTap: () => context.push('/blog/${p.slug}'),
                                    borderRadius: BorderRadius.circular(12),
                                    child: Padding(
                                      padding: const EdgeInsets.all(16),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Container(
                                                padding: const EdgeInsets
                                                    .symmetric(
                                                    horizontal: 8, vertical: 4),
                                                decoration: BoxDecoration(
                                                  color: Theme.of(context)
                                                      .colorScheme
                                                      .primaryContainer,
                                                  borderRadius:
                                                      BorderRadius.circular(12),
                                                ),
                                                child: Text(
                                                  p.category,
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    color: Theme.of(context)
                                                        .colorScheme
                                                        .primary,
                                                    fontWeight: FontWeight.w500,
                                                  ),
                                                ),
                                              ),
                                              const Spacer(),
                                              Text(
                                                '${p.readingTime} min read',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: Colors.grey[500],
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 12),
                                          Text(
                                            p.title,
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleLarge
                                                ?.copyWith(
                                                    fontWeight:
                                                        FontWeight.bold),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            p.metaDescription,
                                            style: TextStyle(
                                                color: Colors.grey[600],
                                                height: 1.4),
                                            maxLines: 3,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            'by ${p.author} · ${p.publishedAt.split('T').first}',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey[500],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class BlogDetailScreen extends ConsumerStatefulWidget {
  final String slug;
  const BlogDetailScreen({super.key, required this.slug});

  @override
  ConsumerState<BlogDetailScreen> createState() => _BlogDetailScreenState();
}

class _BlogDetailScreenState extends ConsumerState<BlogDetailScreen> {
  bool _isLoading = true;
  String? _error;
  _BlogPostDetail? _post;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.get('/api/v1/blog/posts/${widget.slug}');
      if (!mounted) return;
      setState(() {
        _post = _BlogPostDetail.fromJson(resp.data as Map<String, dynamic>);
        _isLoading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.data?['detail'] ?? e.message ?? 'Failed to load post';
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceLight,
        elevation: 0,
        foregroundColor: AppColors.textLight,
        title: Text(
          _post?.title ?? 'Article',
          style: const TextStyle(
            color: AppColors.textLight,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                  color: AppColors.primaryLight))
          : _error != null
              ? _BlogComingSoon(onRetry: _load)
              : _post == null
                  ? const _BlogComingSoon()
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 800),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _post!.title,
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineMedium
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Text(
                                  'by ${_post!.author}',
                                  style: TextStyle(color: Colors.grey[600]),
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  _post!.publishedAt.split('T').first,
                                  style: TextStyle(color: Colors.grey[600]),
                                ),
                                const SizedBox(width: 12),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .primaryContainer,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    _post!.category,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .primary,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),
                            MarkdownBody(
                              data: _post!.content,
                              selectable: true,
                            ),
                          ],
                        ),
                      ),
                    ),
    );
  }
}

class _BlogPost {
  final String id;
  final String slug;
  final String title;
  final String metaDescription;
  final String author;
  final String publishedAt;
  final String category;
  final List<String> tags;
  final int readingTime;
  final String featuredImage;

  _BlogPost({
    required this.id,
    required this.slug,
    required this.title,
    required this.metaDescription,
    required this.author,
    required this.publishedAt,
    required this.category,
    required this.tags,
    required this.readingTime,
    required this.featuredImage,
  });

  factory _BlogPost.fromJson(Map<String, dynamic> j) {
    return _BlogPost(
      id: j['id'] as String? ?? '',
      slug: j['slug'] as String? ?? '',
      title: j['title'] as String? ?? '',
      metaDescription: j['meta_description'] as String? ?? '',
      author: j['author'] as String? ?? '',
      publishedAt: j['published_at'] as String? ?? '',
      category: j['category'] as String? ?? 'uncategorized',
      tags: (j['tags'] as List<dynamic>? ?? const []).cast<String>(),
      readingTime: (j['reading_time'] as num?)?.toInt() ?? 1,
      featuredImage: j['featured_image'] as String? ?? '',
    );
  }
}

class _BlogPostDetail extends _BlogPost {
  final String content;
  final String updatedAt;
  final List<String> keywords;

  _BlogPostDetail({
    required super.id,
    required super.slug,
    required super.title,
    required super.metaDescription,
    required super.author,
    required super.publishedAt,
    required super.category,
    required super.tags,
    required super.readingTime,
    required super.featuredImage,
    required this.content,
    required this.updatedAt,
    required this.keywords,
  });

  factory _BlogPostDetail.fromJson(Map<String, dynamic> j) {
    return _BlogPostDetail(
      id: j['id'] as String? ?? '',
      slug: j['slug'] as String? ?? '',
      title: j['title'] as String? ?? '',
      metaDescription: j['meta_description'] as String? ?? '',
      author: j['author'] as String? ?? '',
      publishedAt: j['published_at'] as String? ?? '',
      category: j['category'] as String? ?? 'uncategorized',
      tags: (j['tags'] as List<dynamic>? ?? const []).cast<String>(),
      readingTime: (j['reading_time'] as num?)?.toInt() ?? 1,
      featuredImage: j['featured_image'] as String? ?? '',
      content: j['content'] as String? ?? '',
      updatedAt: j['updated_at'] as String? ?? '',
      keywords: (j['keywords'] as List<dynamic>? ?? const []).cast<String>(),
    );
  }
}

class _BlogCategory {
  final String name;
  final int count;

  _BlogCategory({required this.name, required this.count});
}

/// Friendly "coming soon" placeholder shown when the blog backend isn't
/// reachable yet (the public `/api/v1/blog/*` endpoints are a Phase 2 deliverable).
/// Keeps the page looking intentional instead of a red error banner.
class _BlogComingSoon extends StatelessWidget {
  final VoidCallback? onRetry;
  const _BlogComingSoon({this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.article_outlined,
                  size: 36,
                  color: AppColors.primaryLight,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Articles coming soon',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'We\u2019re writing practical guides on getting the most out of '
                'PDFs \u2014 merging workflows, AI-powered extraction, accessibility, '
                'and more. Subscribe and we\u2019ll let you know when the first '
                'posts go live.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  color: AppColors.textMutedLight,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 24),
              if (onRetry != null)
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try again'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
