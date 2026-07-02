import {
  listProfiles,
  loadProfile,
  mergeProfiles,
  saveProfile,
  type Profile,
} from "../../profiles.js";

export class ProfileService {
  load(name: string): Profile {
    return loadProfile(name);
  }

  list(): Profile[] {
    return listProfiles();
  }

  save(profile: Profile): void {
    saveProfile(profile);
  }

  compose(names: string[]): Profile {
    return names.length === 1 ? this.load(names[0]) : mergeProfiles(names.map((name) => this.load(name)));
  }
}
