## Task

[64] Dockerfile for the API, with a local compose file bringing up the database beside it.

**Not built, and deliberately.** It was on the should-have list, and the deployment it would have
served already exists: the API runs on Azure App Service, which builds and hosts from the repository
without a container in the loop. Adding one would have produced a second deployment path to keep
working, and no user-visible difference. Time went to the three advanced requirements instead.
