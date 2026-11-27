# A 90-second LinkedIn demonstration

Use the offline generator, the default ticketing brief, and the microservices style. Start with a clean browser workspace and record the workbench at desktop width.

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0–12s | Open **Design from a brief**, show the ticket reservation brief and generate. | “A ticketing team wants to know what breaks as sales grow. I built FutureStack AI to turn that question into a repeatable architecture experiment.” |
| 12–27s | Open a finding's evidence, show the stage trace and approve. | “The workflow separates requirements from assumptions. Three specialist reviews attach sources. I can inspect the evidence and approve the design before it becomes a saved version.” |
| 27–43s | Run traffic growth at 24 base requests/s for 12 seconds. Select month 24. | “At this hypothetical horizon I offer 72 requests per second. The model sends 864 requests. With one database replica, its queue fills and 396 foreground requests fail.” |
| 43–60s | Edit the database to three replicas, save, compare version 2 with version 1. | “I change one assumption and replay exactly the same workload. The new model completes all 864 requests. Successful-request p95 falls from about 992 to 113 milliseconds, while assumed spend rises from 220 to 380 dollars a month.” |
| 60–75s | Select database failure, run and show the orange path. | “Extra processing slots helped with load. A component-wide outage still reaches the gateway through the ledger and API. Those are different failure modes.” |
| 75–90s | Download the report and show its assumptions. | “This is a deterministic simulation. PostgreSQL read replicas, for example, do not automatically increase write capacity. The report records that assumption so the next step can be a real load test.” |

For an event-driven follow-up, generate the telemetry example and increase worker service time. Compare background failures with successful foreground responses. Keep the generator mode visible during recordings.
