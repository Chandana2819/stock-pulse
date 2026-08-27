"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

type CommunityPost = {
  id: string;
  username: string;
  symbol: string;
  title: string;
  likes: number;
  commentCount: number;
  createdAt: string;
};

export default function CommunityModerationPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<CommunityPost[]>("/api/admin/community");
      setPosts(res);
    } catch (err: any) {
      setError(err.message || "Failed to load community discussion entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleModeratePost = async (postId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete post: "${title}"?\n\nThis will write to the audit trail and cannot be undone.`)) return;

    try {
      await api.del(`/api/admin/community/posts/${postId}`);
      alert("Post moderated and removed successfully");
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: any) {
      alert(err.message || "Moderation request failed");
    }
  };

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6 animate-card-enter">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-border-custom pb-4">
        <div>
          <h1 className="font-display text-xl tracking-[0.1em] text-red-custom uppercase">
            Discussion Moderation Control
          </h1>
          <p className="font-mono text-[0.65rem] text-text-3 mt-1 uppercase">
            Review user-generated discussions, manage flags, and remove inappropriate posts
          </p>
        </div>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim/15 p-4 font-mono text-xs text-red-custom uppercase rounded">
          ⚠️ {error}
        </div>
      )}

      {/* Posts Table */}
      <div className="border border-border-custom bg-bg-1 rounded overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-mono text-xs text-text-3 animate-pulse">
            LOADING COMMUNITY LOGS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-2 text-text-2 uppercase text-[0.62rem] tracking-wider">
                  <th className="p-3">Author</th>
                  <th className="p-3">Stock Tag</th>
                  <th className="p-3">Discussion Title</th>
                  <th className="p-3 text-center">Likes</th>
                  <th className="p-3 text-center">Comments</th>
                  <th className="p-3 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-text-4">
                      No community posts found
                    </td>
                  </tr>
                ) : (
                  posts.map((p) => (
                    <tr key={p.id} className="border-b border-border-custom/50 hover:bg-bg-2/30">
                      <td className="p-3 font-bold text-text-custom">@{p.username}</td>
                      <td className="p-3 text-text-3 uppercase">{p.symbol}</td>
                      <td className="p-3 text-text-custom font-semibold max-w-sm truncate" title={p.title}>{p.title}</td>
                      <td className="p-3 text-center text-text-2">{p.likes}</td>
                      <td className="p-3 text-center text-text-2">{p.commentCount}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleModeratePost(p.id, p.title)}
                          className="px-3 py-1 border border-red-custom text-red-custom hover:bg-red-custom hover:text-bg rounded font-bold text-[0.62rem] uppercase transition-all duration-150 cursor-pointer"
                        >
                          Moderate / Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
