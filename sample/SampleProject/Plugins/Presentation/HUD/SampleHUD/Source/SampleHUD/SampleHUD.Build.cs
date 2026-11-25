// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleHUD : ModuleRules
{
	public SampleHUD(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleCore" });
	}
}
