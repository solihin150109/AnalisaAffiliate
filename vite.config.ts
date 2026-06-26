{
  "version": 2,
  "builds": [
    {
      "src": "server.ts",
      "use": "@vercel/node",
      "config": {
        "includeFiles": [
          "prisma/**"
        ]
      }
    },
    {
      "src": "dist/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server.ts"
    },
    {
      "src": "/r",
      "dest": "/server.ts"
    },
    {
      "src": "/(.*)",
      "dest": "/dist/$1"
    }
  ]
}