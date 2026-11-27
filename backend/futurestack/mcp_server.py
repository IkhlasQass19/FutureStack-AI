"""Local stdio capability boundary. Neither tool opens storage or model clients."""

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from .models import Architecture, SimulationInput
from .simulation import Result, simulate
from .skills import Inspection, inspect

server = FastMCP("FutureStack architecture lab")
read_only = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
)


@server.tool(annotations=read_only)
def inspect_architecture(architecture: Architecture) -> Inspection:
    """Inspect a supplied DAG's nominal capacity and synchronous dependencies."""
    return inspect(architecture)


@server.tool(annotations=read_only)
def simulate_architecture(experiment: SimulationInput) -> Result:
    """Run one bounded, deterministic scenario on the supplied architecture."""
    return simulate(experiment.architecture, experiment.scenario)


def main():
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
