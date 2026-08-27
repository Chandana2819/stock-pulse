"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import Link from "next/link";

type Post = {
  id: string;
  title: string;
  content: string;
  symbol: string | null;
  likes: number;
  createdAt: string;
  username: string;
  fullName: string;
  commentCount: number;
  likedByMe: boolean;
  authorId: string;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  username: string;
  fullName: string;
  authorId: string;
};

type SharedWatchlist = {
  id: string;
  title: string;
  description: string | null;
  symbols: string[];
  likes: number;
  views: number;
  createdAt: string;
  username: string;
  fullName: string;
  likedByMe: boolean;
  authorId: string;
};

export default function CommunityPage() {
  const [activeTab, setActiveTab] = useState<"feed" | "watchlists">("feed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Discussion state
  const [posts, setPosts] = useState<Post[]>([]);
  const [filterSymbol, setFilterSymbol] = useState<string | null>(null);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postSymbol, setPostSymbol] = useState("");
  const [commentsOpenPostId, setCommentsOpenPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Watchlist state
  const [watchlists, setWatchlists] = useState<SharedWatchlist[]>([]);
  const [newWlOpen, setNewWlOpen] = useState(false);
  const [wlTitle, setWlTitle] = useState("");
  const [wlDesc, setWlDesc] = useState("");
  const [wlSymbols, setWlSymbols] = useState(""); // comma separated

  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const data = await api.get<{ id: string; role: string }>("/api/user");
      setCurrentUser(data);
    } catch (err) {
      console.error("Failed to fetch user profile", err);
    }
  };

  useEffect(() => {
    if (activeTab === "feed") {
      fetchPosts();
    } else {
      fetchWatchlists();
    }
  }, [activeTab, filterSymbol]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = filterSymbol ? `/api/community/posts?symbol=${filterSymbol}` : "/api/community/posts";
      const data = await api.get<{ posts: Post[] }>(url);
      setPosts(data.posts);
    } catch (err: any) {
      setError(err.message || "Failed to load discussions");
    } finally {
      setLoading(false);
    }
  };

  const fetchWatchlists = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ watchlists: SharedWatchlist[] }>("/api/community/watchlists");
      setWatchlists(data.watchlists);
    } catch (err: any) {
      setError(err.message || "Failed to load shared watchlists");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) return;

    try {
      setError(null);
      const created = await api.post<Post>("/api/community/posts", {
        title: postTitle.trim(),
        content: postContent.trim(),
        symbol: postSymbol.trim() || undefined,
      });
      setPosts((prev) => [created, ...prev]);
      setPostTitle("");
      setPostContent("");
      setPostSymbol("");
      setNewPostOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to create post");
    }
  };

  const handleLikePost = async (postId: string) => {
    try {
      const res = await api.post<{ liked: boolean; likesCount: number }>(`/api/community/posts/${postId}/like`);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, likedByMe: res.liked, likes: res.likesCount } : p))
      );
    } catch (err: any) {
      console.error("Like error", err);
    }
  };

  const handleOpenComments = async (postId: string) => {
    if (commentsOpenPostId === postId) {
      setCommentsOpenPostId(null);
      return;
    }
    setCommentsOpenPostId(postId);
    setComments([]);
    try {
      setCommentsLoading(true);
      const data = await api.get<{ comments: Comment[] }>(`/api/community/posts/${postId}/comments`);
      setComments(data.comments);
    } catch (err: any) {
      console.error("Comments error", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostComment = async (postId: string) => {
    if (!newCommentText.trim()) return;
    try {
      const created = await api.post<Comment>(`/api/community/posts/${postId}/comments`, {
        content: newCommentText.trim(),
      });
      setComments((prev) => [...prev, created]);
      setNewCommentText("");
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p))
      );
    } catch (err: any) {
      console.error("Post comment error", err);
    }
  };

  const handleShareWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wlTitle.trim() || !wlSymbols.trim()) return;

    const symbolsArray = wlSymbols
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    try {
      setError(null);
      const created = await api.post<SharedWatchlist>("/api/community/watchlists", {
        title: wlTitle.trim(),
        description: wlDesc.trim() || undefined,
        symbols: symbolsArray,
      });
      setWatchlists((prev) => [created, ...prev]);
      setWlTitle("");
      setWlDesc("");
      setWlSymbols("");
      setNewWlOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to share watchlist");
    }
  };

  const handleLikeWatchlist = async (wlId: string) => {
    try {
      const res = await api.post<{ liked: boolean; likesCount: number }>(`/api/community/watchlists/${wlId}/like`);
      setWatchlists((prev) =>
        prev.map((w) => (w.id === wlId ? { ...w, likedByMe: res.liked, likes: res.likesCount } : w))
      );
    } catch (err: any) {
      console.error("Like watchlist error", err);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await api.del(`/api/community/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: any) {
      alert(err.message || "Failed to delete post");
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6 animate-card-enter">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom">INVESTOR COMMUNITY</h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1">Share watchlists, discuss trades, and exchange sentiment with other members.</p>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-bg-2 border border-border-custom p-0.5 rounded shrink-0">
          <button
            onClick={() => {
              setActiveTab("feed");
              setFilterSymbol(null);
            }}
            className={`px-4 py-1.5 font-mono text-[0.7rem] uppercase tracking-wider cursor-pointer transition-colors ${
              activeTab === "feed" ? "bg-bg-4 text-green-custom font-bold" : "text-text-2 hover:text-text-custom"
            }`}
          >
            Discussions
          </button>
          <button
            onClick={() => setActiveTab("watchlists")}
            className={`px-4 py-1.5 font-mono text-[0.7rem] uppercase tracking-wider cursor-pointer transition-colors ${
              activeTab === "watchlists" ? "bg-bg-4 text-green-custom font-bold" : "text-text-2 hover:text-text-custom"
            }`}
          >
            Shared Watchlists
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim p-4 font-mono text-xs text-red-custom leading-relaxed uppercase">
          {error}
        </div>
      )}

      {/* FILTER BAR FOR FEED */}
      {activeTab === "feed" && filterSymbol && (
        <div className="border border-green-custom/30 bg-green-dim/10 p-3 flex items-center justify-between font-mono text-xs text-green-custom">
          <span>Filtering posts matching: <strong>{filterSymbol}</strong></span>
          <button onClick={() => setFilterSymbol(null)} className="hover:underline font-bold">
            [ CLEAR FILTER ]
          </button>
        </div>
      )}

      {/* TABS CONTAINER */}
      <div className="flex flex-col gap-6">
        {/* DISCUSSION FEED TAB */}
        {activeTab === "feed" && (
          <div className="flex flex-col gap-4">
            {/* Create Post Button */}
            {!newPostOpen ? (
              <button
                onClick={() => setNewPostOpen(true)}
                className="w-full py-3 font-mono text-xs font-bold border border-dashed border-border-bright text-text-2 hover:border-green-custom hover:text-green-custom transition-all bg-bg-1 cursor-pointer uppercase"
              >
                + Start a New Discussion Post
              </button>
            ) : (
              <form onSubmit={handleCreatePost} className="border border-border-bright bg-bg-1 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-xs font-bold text-text-custom uppercase">// Write Discussion Post</h3>
                  <button type="button" onClick={() => setNewPostOpen(false)} className="font-mono text-[0.62rem] text-red-custom hover:underline">
                    CANCEL
                  </button>
                </div>
                <div className="flex flex-col gap-3 font-mono text-xs">
                  <input
                    type="text"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="POST TITLE"
                    required
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4"
                  />
                  <textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="What is your thesis or question? Support with evidence..."
                    rows={4}
                    required
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4"
                  />
                  <input
                    type="text"
                    value={postSymbol}
                    onChange={(e) => setPostSymbol(e.target.value)}
                    placeholder="TAG STOCK SYMBOL (Optional, e.g. RELIANCE.NS)"
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4 uppercase"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-2 border border-green-custom bg-green-custom text-bg hover:bg-green-custom/80 transition-colors font-mono text-xs font-bold cursor-pointer uppercase"
                  >
                    Publish Post
                  </button>
                </div>
              </form>
            )}

            {/* Posts List */}
            {loading ? (
              <div className="text-center py-10 font-mono text-xs text-text-3">Loading discussions...</div>
            ) : posts.length === 0 ? (
              <div className="border border-border-custom bg-bg-1 p-10 text-center font-mono text-xs text-text-3">
                No discussion posts found. Be the first to start a discussion!
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {posts.map((post) => (
                  <div key={post.id} className="border border-border-custom bg-bg-1 hover:border-border-bright transition-all p-5 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.68rem] text-text-2 font-bold uppercase">@{post.username}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-border-bright" />
                        <span className="font-mono text-[0.6rem] text-text-3">{new Date(post.createdAt).toLocaleDateString()}</span>
                      </div>
                      {post.symbol && (
                        <button
                          onClick={() => setFilterSymbol(post.symbol)}
                          className="font-mono text-[0.58rem] font-bold px-2 py-0.5 border border-cyan-custom/30 text-cyan-custom bg-cyan-dim uppercase hover:bg-cyan-custom hover:text-bg transition-colors"
                        >
                          ${post.symbol}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h2 className="font-display text-lg text-text-custom leading-tight tracking-[0.05em] uppercase">{post.title}</h2>
                      <p className="font-body text-xs text-text-2 whitespace-pre-wrap leading-relaxed">{post.content}</p>
                    </div>
                    <hr className="border-border-custom" />
                    {/* Action buttons */}
                    <div className="flex items-center gap-6 font-mono text-[0.68rem] w-full">
                      <button
                        onClick={() => handleLikePost(post.id)}
                        className={`flex items-center gap-1.5 cursor-pointer transition-colors ${
                          post.likedByMe ? "text-green-custom font-bold" : "text-text-3 hover:text-text-custom"
                        }`}
                      >
                        <span>{post.likedByMe ? "❤️" : "🤍"}</span>
                        <span>{post.likes} Likes</span>
                      </button>
                      <button
                        onClick={() => handleOpenComments(post.id)}
                        className={`flex items-center gap-1.5 cursor-pointer hover:text-text-custom transition-colors ${
                          commentsOpenPostId === post.id ? "text-cyan-custom font-bold" : "text-text-3"
                        }`}
                      >
                        <span>💬</span>
                        <span>{post.commentCount} Comments</span>
                      </button>
                      {(currentUser?.role === "ADMIN" || post.authorId === currentUser?.id) && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="flex items-center gap-1.5 cursor-pointer text-red-custom hover:text-red-custom/80 transition-colors ml-auto font-mono text-[0.62rem] border border-red-custom/30 px-2 py-0.5 rounded hover:bg-red-dim/10"
                        >
                          <span>🗑️</span>
                          <span>Delete</span>
                        </button>
                      )}
                    </div>

                    {/* COMMENTS PANEL */}
                    {commentsOpenPostId === post.id && (
                      <div className="mt-3 border-t border-border-custom pt-4 flex flex-col gap-3 bg-bg-2/30 p-3 rounded">
                        <h4 className="font-mono text-[0.62rem] font-bold text-text-3 uppercase tracking-wider">// Discussion Comments</h4>

                        {/* List Comments */}
                        {commentsLoading ? (
                          <div className="text-center font-mono text-[0.6rem] text-text-4">Loading comments...</div>
                        ) : comments.length === 0 ? (
                          <div className="font-mono text-[0.6rem] text-text-4 text-center py-2">No comments yet. Write one below!</div>
                        ) : (
                          <div className="flex flex-col gap-3 max-h-60 overflow-y-auto">
                            {comments.map((c) => (
                              <div key={c.id} className="flex flex-col gap-1 text-[0.68rem] leading-relaxed">
                                <div className="flex items-center gap-2 font-mono text-[0.58rem]">
                                  <span className="text-text-2 font-bold uppercase">@{c.username}</span>
                                  <span className="text-text-4">{new Date(c.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-text-custom pl-2 border-l border-border-bright">{c.content}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Comment Input */}
                        <div className="flex gap-2 font-mono text-xs mt-2">
                          <input
                            type="text"
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            placeholder="Type comment..."
                            className="flex-1 bg-bg border border-border-custom text-text-custom p-1.5 focus:border-green-custom focus:outline-none placeholder:text-text-4"
                          />
                          <button
                            onClick={() => handlePostComment(post.id)}
                            className="px-4 py-1.5 border border-cyan-custom text-cyan-custom hover:bg-cyan-custom hover:text-bg transition-colors font-bold cursor-pointer"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SHARED WATCHLISTS TAB */}
        {activeTab === "watchlists" && (
          <div className="flex flex-col gap-4">
            {/* Share Watchlist Form Toggle */}
            {!newWlOpen ? (
              <button
                onClick={() => setNewWlOpen(true)}
                className="w-full py-3 font-mono text-xs font-bold border border-dashed border-border-bright text-text-2 hover:border-green-custom hover:text-green-custom transition-all bg-bg-1 cursor-pointer uppercase"
              >
                + Share Watchlist to Community
              </button>
            ) : (
              <form onSubmit={handleShareWatchlist} className="border border-border-bright bg-bg-1 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-xs font-bold text-text-custom uppercase">// Share Watchlist</h3>
                  <button type="button" onClick={() => setNewWlOpen(false)} className="font-mono text-[0.62rem] text-red-custom hover:underline">
                    CANCEL
                  </button>
                </div>
                <div className="flex flex-col gap-3 font-mono text-xs">
                  <input
                    type="text"
                    value={wlTitle}
                    onChange={(e) => setWlTitle(e.target.value)}
                    placeholder="WATCHLIST TITLE (e.g. High Growth Tech 2026)"
                    required
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4"
                  />
                  <input
                    type="text"
                    value={wlDesc}
                    onChange={(e) => setWlDesc(e.target.value)}
                    placeholder="SHORT DESCRIPTION (e.g. My top picks for upcoming sector breakout)"
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4"
                  />
                  <input
                    type="text"
                    value={wlSymbols}
                    onChange={(e) => setWlSymbols(e.target.value)}
                    placeholder="SYMBOLS (Comma separated, e.g. RELIANCE.NS, TCS.NS, AAPL)"
                    required
                    className="bg-bg border border-border-custom text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4 uppercase"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-2 border border-green-custom bg-green-custom text-bg hover:bg-green-custom/80 transition-colors font-mono text-xs font-bold cursor-pointer uppercase"
                  >
                    Share Watchlist
                  </button>
                </div>
              </form>
            )}

            {/* Shared Watchlists Grid */}
            {loading ? (
              <div className="text-center py-10 font-mono text-xs text-text-3">Loading watchlists...</div>
            ) : watchlists.length === 0 ? (
              <div className="border border-border-custom bg-bg-1 p-10 text-center font-mono text-xs text-text-3">
                No shared watchlists found. Share your watchlist to help others!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {watchlists.map((wl) => (
                  <div key={wl.id} className="border border-border-custom bg-bg-1 p-5 rounded flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[0.62rem] text-text-3 uppercase">Shared by @{wl.username}</span>
                        <span className="font-mono text-[0.58rem] text-text-4">{new Date(wl.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-text-custom tracking-[0.05em] uppercase">{wl.title}</h3>
                        {wl.description && <p className="font-body text-xs text-text-2 mt-1 leading-snug">{wl.description}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {wl.symbols.map((sym) => (
                          <Link
                            key={sym}
                            href={`/stock/${sym}`}
                            className="font-mono text-[0.58rem] px-2 py-0.5 border border-border-bright text-text-2 bg-bg-2 rounded-sm hover:border-green-custom hover:text-green-custom transition-all no-underline"
                          >
                            {sym}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <hr className="border-border-custom" />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => handleLikeWatchlist(wl.id)}
                        className={`flex items-center gap-1.5 font-mono text-[0.68rem] cursor-pointer transition-colors ${
                          wl.likedByMe ? "text-green-custom font-bold" : "text-text-3 hover:text-text-custom"
                        }`}
                      >
                        <span>{wl.likedByMe ? "❤️" : "🤍"}</span>
                        <span>{wl.likes} Likes</span>
                      </button>
                      <span className="font-mono text-[0.6rem] text-text-4">👁️ {wl.views + 12} Views</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
