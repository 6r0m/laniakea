// SPDX-License-Identifier: AGPL-3.0-or-later

using UnrealBuildTool;

public class SampleCore : ModuleRules
{
	public SampleCore(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine" });
	}
}
