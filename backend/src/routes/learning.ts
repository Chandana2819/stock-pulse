import express from "express";
import { prisma } from "../lib/prisma";
import { LESSONS, getLesson, lessonsByLevel } from "../lib/learning";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const level = req.query.level as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | undefined;
    const lessons = lessonsByLevel(level).map((l) => ({ id: l.id, title: l.title, level: l.level, track: l.track, summary: l.summary, related: l.related }));

    let progressMap: Record<string, string> = {};
    if (req.user) {
      const progress = await prisma.learningProgress.findMany({ where: { userId: req.user.id } });
      progressMap = Object.fromEntries(progress.map((p) => [p.lessonId, p.status]));
    }
    return res.json({ lessons: lessons.map((l) => ({ ...l, status: progressMap[l.id] ?? "NOT_STARTED" })), tracks: [...new Set(LESSONS.map((l) => l.track))] });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lesson = getLesson(req.params.id);
    if (!lesson) throw ApiError.notFound("Lesson not found");
    if (req.user) {
      await prisma.learningProgress.upsert({
        where: { userId_lessonId: { userId: req.user.id, lessonId: lesson.id } },
        update: {},
        create: { userId: req.user.id, lessonId: lesson.id, status: "IN_PROGRESS" },
      });
    }
    return res.json(lesson);
  })
);

router.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const lesson = getLesson(req.params.id);
    if (!lesson) throw ApiError.notFound("Lesson not found");
    const { quizScore } = parse({ quizScore: v.optional(v.number({ min: 0, max: 100, int: true })) }, req.body);

    const progress = await prisma.learningProgress.upsert({
      where: { userId_lessonId: { userId: req.user!.id, lessonId: lesson.id } },
      update: { status: "COMPLETED", quizScore, completedAt: new Date() },
      create: { userId: req.user!.id, lessonId: lesson.id, status: "COMPLETED", quizScore, completedAt: new Date() },
    });
    return res.json(progress);
  })
);

export default router;
