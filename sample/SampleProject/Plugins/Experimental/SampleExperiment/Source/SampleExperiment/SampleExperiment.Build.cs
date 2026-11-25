// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleExperiment : ModuleRules
{
	public SampleExperiment(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.Add("Core");
		PrivateDependencyModuleNames.AddRange(new string[] {
			"SampleCore", "SampleGameplay", "SampleMatch", "SampleTelemetry" });
	}
}
