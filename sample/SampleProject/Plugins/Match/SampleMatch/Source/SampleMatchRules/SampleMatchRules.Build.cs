// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleMatchRules : ModuleRules
{
	public SampleMatchRules(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleCore" });
	}
}
