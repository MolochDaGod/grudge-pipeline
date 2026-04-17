########################################################################
# ATTACKMOTION ASSET ORGANIZER
# Unzips all ZIPs into categorized folders for review
########################################################################

$root = "F:\GitHub\grudge-pipeline\attackmotion"
$organized = "$root\_organized"

# Category folders
$categories = @(
    "01_Characters_Models",
    "02_Animation_Packs",
    "03_Environments_Props",
    "04_Weapons_Equipment",
    "05_Effects_VFX",
    "06_UI_2D_Pixel",
    "07_Space_Assets",
    "08_RTS_Buildings",
    "09_Audio",
    "10_Code_Engine",
    "11_Misc"
)

foreach ($cat in $categories) {
    $path = "$organized\$cat"
    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created: $cat"
    }
}

$zipMap = @{
    "Creature NPC Pack.zip"                                    = "01_Characters_Models"
    "Dictators.zip"                                            = "01_Characters_Models"
    "Easy Animated Enemy Pack - Jan 2019 (1).zip"              = "01_Characters_Models"
    "Monster_Pack_Free_Character (1).zip"                      = "01_Characters_Models"
    "Retro_Survivors.zip"                                      = "01_Characters_Models"
    "pirate rogue Racalvin.zip"                                = "01_Characters_Models"
    "Meshy_AI_Captain_Rcalvin_The_P_0331051233_texture_fixed.zip" = "01_Characters_Models"
    "starcraft_marine.zip"                                     = "01_Characters_Models"
    "marine_walk.zip"                                          = "01_Characters_Models"
    "raptor.zip"                                               = "01_Characters_Models"
    "skyrim_werewolf_rig.zip"                                  = "01_Characters_Models"
    "stylized_sci-_fi_soldier_animated.zip"                    = "01_Characters_Models"
    "Styloorobotcharacte fbx and gltfr.zip"                    = "01_Characters_Models"
    "craftpix-net-636502-free-wild-animal-3d-low-poly-models.zip" = "01_Characters_Models"

    "Animations_V1_01.zip"                                     = "02_Animation_Packs"
    "Anims_Only_glTF_V1.zip"                                   = "02_Animation_Packs"
    "Enemy_Animations_Set.zip"                                 = "02_Animation_Packs"
    "Locomotion Pack.zip"                                      = "02_Animation_Packs"
    "Pistol_Handgun Locomotion Pack.zip"                       = "02_Animation_Packs"
    "Pro Longbow Pack (3).zip"                                 = "02_Animation_Packs"
    "Pro Magic Pack (1).zip"                                   = "02_Animation_Packs"
    "Pro Melee Axe Pack (1).zip"                               = "02_Animation_Packs"
    "Pro Sword and Shield Pack.zip"                            = "02_Animation_Packs"
    "Rifle 8-Way Locomotion Pack.zip"                          = "02_Animation_Packs"
    "profession.zip"                                           = "02_Animation_Packs"

    "CampfireSpookyStories_v0.95.zip"                          = "03_Environments_Props"
    "craftpix-891176-free-environment-props-3d-low-poly-models.zip" = "03_Environments_Props"
    "crates_and_barrels.zip"                                   = "03_Environments_Props"
    "DesertCastlePack.zip"                                     = "03_Environments_Props"
    "EEE - Low_Poly_Foliage_Pack_001.zip"                      = "03_Environments_Props"
    "Env_00.zip"                                               = "03_Environments_Props"
    "modular_terrain_collection.zip"                           = "03_Environments_Props"
    "pirate_tavern.zip"                                        = "03_Environments_Props"
    "realistic_trees_collection.zip"                           = "03_Environments_Props"
    "scary_forest.zip"                                         = "03_Environments_Props"
    "sci-fi_alien_city.zip"                                    = "03_Environments_Props"
    "soiTavern_fbx.zip"                                        = "03_Environments_Props"
    "stylized_log.zip"                                         = "03_Environments_Props"
    "crafting_materials.zip"                                   = "03_Environments_Props"

    "craftpix-net-772261-free-hammer-3d-low-poly-models.zip"   = "04_Weapons_Equipment"
    "small_set_of_daggers.zip"                                 = "04_Weapons_Equipment"
    "stylized_frost_gun.zip"                                   = "04_Weapons_Equipment"
    "Styloo Guns Asset Pack GLTF FBX V1.1.zip"                = "04_Weapons_Equipment"

    "appearance_effect_light_beam.zip"                         = "05_Effects_VFX"
    "appearance_effect_starlight.zip"                          = "05_Effects_VFX"
    "attack_slashes.zip"                                       = "05_Effects_VFX"
    "effects.zip"                                              = "05_Effects_VFX"
    "stylized_explosion_effect_simulation.zip"                 = "05_Effects_VFX"
    "Effect and FX Pixel All Free.zip"                         = "05_Effects_VFX"
    "Pixel Art Animations - Slashes.zip"                       = "05_Effects_VFX"
    "Pixel Art Skill Animations - Lightning.zip"               = "05_Effects_VFX"

    "Card RPG items.zip"                                       = "06_UI_2D_Pixel"
    "Card RPG UI&Charactors.zip"                               = "06_UI_2D_Pixel"
    "IsometricTRPGAssetPack.zip"                               = "06_UI_2D_Pixel"
    "Pixel Crawler - Free Pack 2.0.4.zip"                      = "06_UI_2D_Pixel"
    "Pixel UI pack 3.zip"                                      = "06_UI_2D_Pixel"
    "Retro Inventory.zip"                                      = "06_UI_2D_Pixel"
    "sigils.zip"                                               = "06_UI_2D_Pixel"

    "Mini space pack.zip"                                      = "07_Space_Assets"
    "space_background_pack.zip"                                = "07_Space_Assets"
    "spaceship_blocks_collection.zip"                          = "07_Space_Assets"
    "SpaceShooterAssetPack (1).zip"                            = "07_Space_Assets"
    "SpaceShooterAssetPack.zip"                                = "07_Space_Assets"

    "missiletower_building002.zip"                             = "08_RTS_Buildings"
    "missiletower1_building003.zip"                            = "08_RTS_Buildings"
    "researchcenter_building001.zip"                           = "08_RTS_Buildings"
    "rts_radar_tower.zip"                                      = "08_RTS_Buildings"
    "rts_target.zip"                                           = "08_RTS_Buildings"

    "Sound effects Pack 2.zip"                                 = "09_Audio"

    "annihilate-dev.zip"                                       = "10_Code_Engine"
    "Survival-Combat-Engine-1.zip"                             = "10_Code_Engine"
}

$total = $zipMap.Count
$i = 0
foreach ($zip in $zipMap.GetEnumerator()) {
    $i++
    $zipPath = "$root\$($zip.Key)"
    $destFolder = "$organized\$($zip.Value)\$([System.IO.Path]::GetFileNameWithoutExtension($zip.Key))"

    if (!(Test-Path $zipPath)) {
        Write-Host "[$i/$total] SKIP (not found): $($zip.Key)"
        continue
    }
    if (Test-Path $destFolder) {
        Write-Host "[$i/$total] SKIP (exists): $($zip.Key)"
        continue
    }

    Write-Host "[$i/$total] Extracting: $($zip.Key) -> $($zip.Value)"
    try {
        Expand-Archive -Path $zipPath -DestinationPath $destFolder -Force -ErrorAction Stop
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)"
    }
}

# Copy Toon_RTS
$toonSrc = "$root\Toon_RTS"
$toonDst = "$organized\01_Characters_Models\Toon_RTS"
if ((Test-Path $toonSrc) -and !(Test-Path $toonDst)) {
    Write-Host "Copying Toon_RTS faction models..."
    Copy-Item -Path $toonSrc -Destination $toonDst -Recurse -Force
}

# Copy grudgeracecharacters
$grSrc = "$root\grudgeracecharacters"
$grDst = "$organized\01_Characters_Models\grudgeracecharacters"
if ((Test-Path $grSrc) -and !(Test-Path $grDst)) {
    Write-Host "Copying grudgeracecharacters..."
    Copy-Item -Path $grSrc -Destination $grDst -Recurse -Force
}

Write-Host ""
Write-Host "=== EXTRACTION COMPLETE ==="

$categories | ForEach-Object {
    $p = "$organized\$_"
    if (Test-Path $p) {
        $count = (Get-ChildItem $p -Directory -ErrorAction SilentlyContinue).Count
        Write-Host "$_ : $count asset packs"
    }
}
