// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleGameplay : ModuleRules
{
	public SampleGameplay(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "SampleCore" });
		PrivateDependencyModuleNames.Add("SampleHUD");
	}
}
