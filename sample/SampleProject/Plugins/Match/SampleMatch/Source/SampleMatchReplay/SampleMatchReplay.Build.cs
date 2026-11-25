// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleMatchReplay : ModuleRules
{
	public SampleMatchReplay(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleCore" });
		PrivateDependencyModuleNames.Add("SampleTelemetry");
	}
}
