# gridcalc documentation

| Area         | Document                                                   | What it covers                                                    |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Product      | [PRD](product/PRD.md)                                      | Vision, personas, goals, scope, metrics, release plan             |
|              | [Requirements](product/requirements.md)                    | Numbered FR and NFR with priority and acceptance criteria         |
|              | [User stories](product/user-stories.md)                    | Epics and Given/When/Then stories                                 |
|              | [Traceability](product/requirements-traceability.md)       | FR to epic, ticket, module, test and status                       |
| Architecture | [Overview](architecture/overview.md)                       | C4 diagrams, module boundaries, request lifecycle                 |
|              | [Quality attributes](architecture/quality-attributes.md)   | Measurable targets and how they are verified                      |
|              | [ADRs](adr/README.md)                                      | 18 architecture decision records                                  |
| Design       | [System design](design/system-design.md)                   | State machines, sequences, algorithms and complexity, concurrency |
|              | [Data model](design/data-model.md)                         | Target ERD, table notes, indexes, migrations done and planned     |
| API          | [OpenAPI 3.1](api/openapi.yaml)                            | Full target API with `x-status` per operation                     |
|              | [API guide](api/README.md)                                 | Conventions, errors, auth, pagination, concurrency, curl          |
| Security     | [Threat model](security/threat-model.md)                   | Assets, trust boundaries, STRIDE, ASVS mapping                    |
| Testing      | [Test strategy](testing/test-strategy.md)                  | Pyramid, suites, property tests, coverage, acceptance matrix      |
| Operations   | [Runbook](operations/runbook.md)                           | Configuration, commands, backup/restore, troubleshooting          |
|              | [Deployment](operations/deployment.md)                     | systemd, nginx and native PostgreSQL; release and rollback        |
| Planning     | [Roadmap](planning/roadmap.md)                             | Milestones M0-M9 with exit criteria                               |
|              | [Backlog](planning/backlog.md)                             | Every ticket with estimate, status and dependencies               |
|              | [Implementation status](planning/implementation-status.md) | What is done (about 10%), what is stubbed, how it is measured     |
|              | [Risks](planning/risks.md)                                 | Risk register                                                     |
| Reference    | [Glossary](glossary.md)                                    | Spreadsheet and engine terminology                                |
