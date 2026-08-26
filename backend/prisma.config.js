const { defineConfig } = require("prisma/config");
require("dotenv").config();

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/stockpulse?schema=public",
  },
});
