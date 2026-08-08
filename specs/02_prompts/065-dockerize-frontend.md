## Task

[65] Dockerfile for the frontend, added to the same compose setup as [64].

**Not built**, same reasoning, and with one more argument against it: the frontend is a static bundle
that Netlify builds from the repository. Putting a static bundle in a container adds a process where
there does not need to be one.
