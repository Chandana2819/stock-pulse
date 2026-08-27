import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";

const router = express.Router();

// Authenticated or device-session users allowed
router.use(requireAuth);

// ─── DISCUSSION POSTS ───

// Get recent posts (optionally filtered by stock symbol)
router.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const symbol = req.query.symbol as string | undefined;

    const posts = await prisma.communityPost.findMany({
      where: symbol ? { symbol } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
          },
        },
        comments: {
          select: {
            id: true,
          },
        },
        postLikes: {
          where: { userId: req.user!.id },
          select: { id: true },
        },
      },
    });

    const enriched = posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      symbol: post.symbol,
      likes: post.likes,
      createdAt: post.createdAt,
      username: post.user?.username || "Anonymous",
      fullName: post.user?.fullName || "StockPulse User",
      commentCount: post.comments.length,
      likedByMe: post.postLikes.length > 0,
      authorId: post.userId,
    }));

    return res.json({ posts: enriched });
  })
);

// Create a new discussion post
router.post(
  "/posts",
  asyncHandler(async (req, res) => {
    const { title, content, symbol } = req.body;

    if (!title || !content) {
      throw ApiError.badRequest("Title and content are required");
    }

    const post = await prisma.communityPost.create({
      data: {
        userId: req.user!.id,
        title: title.trim(),
        content: content.trim(),
        symbol: symbol ? symbol.trim().toUpperCase() : null,
      },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    await audit(req, "COMMUNITY_POST_CREATE", {
      userId: req.user!.id,
      entity: "CommunityPost",
      entityId: post.id,
    });

    return res.json({
      ...post,
      username: post.user?.username || "Anonymous",
      commentCount: 0,
      likedByMe: false,
    });
  })
);

// Toggle like on a post
router.post(
  "/posts/:id/like",
  asyncHandler(async (req, res) => {
    const postId = req.params.id;
    const userId = req.user!.id;

    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw ApiError.notFound("Post not found");

    const existingLike = await prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    let liked = false;
    if (existingLike) {
      // Unlike
      await prisma.postLike.delete({ where: { id: existingLike.id } });
      await prisma.communityPost.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } },
      });
    } else {
      // Like
      await prisma.postLike.create({ data: { userId, postId } });
      await prisma.communityPost.update({
        where: { id: postId },
        data: { likes: { increment: 1 } },
      });
      liked = true;
    }

    const updatedPost = await prisma.communityPost.findUnique({ where: { id: postId } });

    return res.json({
      liked,
      likesCount: updatedPost?.likes || 0,
    });
  })
);

// Delete a post (allowed for post author or admin)
router.delete(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const postId = req.params.id;
    const userId = req.user!.id;
    const role = req.user!.role;

    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw ApiError.notFound("Post not found");

    if (post.userId !== userId && role !== "ADMIN") {
      throw ApiError.forbidden("You do not have permission to delete this post");
    }

    await prisma.communityPost.delete({ where: { id: postId } });

    await audit(req, "COMMUNITY_POST_DELETE", {
      userId,
      entity: "CommunityPost",
      entityId: postId,
    });

    return res.json({ success: true, message: "Post deleted successfully" });
  })
);

// ─── COMMENTS ───

// Get comments for a post
router.get(
  "/posts/:id/comments",
  asyncHandler(async (req, res) => {
    const postId = req.params.id;

    const comments = await prisma.communityComment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
          },
        },
      },
    });

    const mapped = comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      username: c.user?.username || "Anonymous",
      fullName: c.user?.fullName || "StockPulse User",
      authorId: c.userId,
    }));

    return res.json({ comments: mapped });
  })
);

// Post a comment
router.post(
  "/posts/:id/comments",
  asyncHandler(async (req, res) => {
    const postId = req.params.id;
    const { content } = req.body;

    if (!content) {
      throw ApiError.badRequest("Comment content is required");
    }

    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw ApiError.notFound("Post not found");

    const comment = await prisma.communityComment.create({
      data: {
        postId,
        userId: req.user!.id,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
          },
        },
      },
    });

    return res.json({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      username: comment.user?.username || "Anonymous",
      fullName: comment.user?.fullName || "StockPulse User",
      authorId: comment.userId,
    });
  })
);

// ─── USER FOLLOWS & PUBLIC PROFILES ───

// Toggle follow on a user
router.post(
  "/users/:id/follow",
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const myId = req.user!.id;

    if (targetUserId === myId) {
      throw ApiError.badRequest("You cannot follow yourself");
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw ApiError.notFound("User not found");

    const existingFollow = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: myId, followingId: targetUserId } },
    });

    let following = false;
    if (existingFollow) {
      await prisma.userFollow.delete({ where: { id: existingFollow.id } });
    } else {
      await prisma.userFollow.create({ data: { followerId: myId, followingId: targetUserId } });
      following = true;
    }

    // Return current count of followers
    const followersCount = await prisma.userFollow.count({ where: { followingId: targetUserId } });

    return res.json({
      following,
      followersCount,
    });
  })
);

// Get public profile details of a user
router.get(
  "/users/:id/profile",
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        fullName: true,
        createdAt: true,
        role: true,
      },
    });

    if (!targetUser) throw ApiError.notFound("User not found");

    const followersCount = await prisma.userFollow.count({ where: { followingId: targetUserId } });
    const followingCount = await prisma.userFollow.count({ where: { followerId: targetUserId } });

    const isFollowing = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: req.user!.id, followingId: targetUserId } },
    });

    const recentPosts = await prisma.communityPost.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const sharedWatchlists = await prisma.sharedWatchlist.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return res.json({
      user: {
        id: targetUser.id,
        username: targetUser.username || "Anonymous",
        fullName: targetUser.fullName || "StockPulse User",
        createdAt: targetUser.createdAt,
        role: targetUser.role,
      },
      followersCount,
      followingCount,
      followingByMe: !!isFollowing,
      posts: recentPosts,
      watchlists: sharedWatchlists,
    });
  })
);

// ─── SHARED WATCHLISTS ───

// Get all shared watchlists
router.get(
  "/watchlists",
  asyncHandler(async (req, res) => {
    const watchlists = await prisma.sharedWatchlist.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
          },
        },
        watchlistLikes: {
          where: { userId: req.user!.id },
          select: { id: true },
        },
      },
    });

    const enriched = watchlists.map((wl) => {
      let parsedSymbols: string[] = [];
      try {
        parsedSymbols = JSON.parse(wl.symbols);
      } catch {
        parsedSymbols = [];
      }

      return {
        id: wl.id,
        title: wl.title,
        description: wl.description,
        symbols: parsedSymbols,
        likes: wl.likes,
        views: wl.views,
        createdAt: wl.createdAt,
        username: wl.user?.username || "Anonymous",
        fullName: wl.user?.fullName || "StockPulse User",
        likedByMe: wl.watchlistLikes.length > 0,
        authorId: wl.userId,
      };
    });

    return res.json({ watchlists: enriched });
  })
);

// Share a watchlist
router.post(
  "/watchlists",
  asyncHandler(async (req, res) => {
    const { title, description, symbols } = req.body;

    if (!title || !symbols || !Array.isArray(symbols) || symbols.length === 0) {
      throw ApiError.badRequest("Title and a non-empty array of symbols are required");
    }

    const wl = await prisma.sharedWatchlist.create({
      data: {
        userId: req.user!.id,
        title: title.trim(),
        description: description?.trim() || null,
        symbols: JSON.stringify(symbols.map((s) => s.trim().toUpperCase())),
      },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    await audit(req, "COMMUNITY_WATCHLIST_SHARE", {
      userId: req.user!.id,
      entity: "SharedWatchlist",
      entityId: wl.id,
    });

    return res.json({
      ...wl,
      symbols,
      username: wl.user?.username || "Anonymous",
      likedByMe: false,
    });
  })
);

// Toggle like on a shared watchlist
router.post(
  "/watchlists/:id/like",
  asyncHandler(async (req, res) => {
    const watchlistId = req.params.id;
    const userId = req.user!.id;

    const wl = await prisma.sharedWatchlist.findUnique({ where: { id: watchlistId } });
    if (!wl) throw ApiError.notFound("Shared Watchlist not found");

    const existingLike = await prisma.watchlistLike.findUnique({
      where: { userId_watchlistId: { userId, watchlistId } },
    });

    let liked = false;
    if (existingLike) {
      await prisma.watchlistLike.delete({ where: { id: existingLike.id } });
      await prisma.sharedWatchlist.update({
        where: { id: watchlistId },
        data: { likes: { decrement: 1 } },
      });
    } else {
      await prisma.watchlistLike.create({ data: { userId, watchlistId } });
      await prisma.sharedWatchlist.update({
        where: { id: watchlistId },
        data: { likes: { increment: 1 } },
      });
      liked = true;
    }

    const updatedWl = await prisma.sharedWatchlist.findUnique({ where: { id: watchlistId } });

    return res.json({
      liked,
      likesCount: updatedWl?.likes || 0,
    });
  })
);

export default router;
