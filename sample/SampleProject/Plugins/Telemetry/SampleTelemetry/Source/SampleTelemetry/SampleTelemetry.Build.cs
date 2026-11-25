// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleTelemetry : ModuleRules
{
	public SampleTelemetry(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleCore" });
	}
}
