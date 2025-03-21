// src/services/CloudSyncService.js
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

export const CloudSyncService = {
  // Fetch doctor preferences from Firebase
  async fetchDoctorPreferences() {
    try {
      const doctorsSnapshot = await getDocs(collection(db, "doctors"));
      const doctors = [];
      
      doctorsSnapshot.forEach((doc) => {
        const doctorData = doc.data();
        // Format doctor data to match your app's structure
        if (doctorData.name) {
          doctors.push({
            id: doc.id,
            name: doctorData.name,
            seniority: doctorData.seniority || "Junior",
            pref: doctorData.pref || "None"
          });
        }
      });
      
      return doctors;
    } catch (error) {
      console.error("Error fetching doctor preferences:", error);
      throw error;
    }
  },
  
  // Fetch doctor availability from Firebase
  async fetchDoctorAvailability() {
    try {
      const availabilitySnapshot = await getDocs(collection(db, "availability"));
      const availability = {};
      
      availabilitySnapshot.forEach((doc) => {
        const doctorId = doc.id;
        const doctorAvailability = doc.data();
        
        // Find doctor name from ID (optional - requires additional query)
        // For this implementation, we'll use the doctor ID as key
        availability[doctorId] = doctorAvailability;
      });
      
      // Since this uses user IDs rather than names, we need to map them
      // Additional step: map Firebase user IDs to doctor names
      const doctorsSnapshot = await getDocs(collection(db, "doctors"));
      const doctorIdToName = {};
      
      doctorsSnapshot.forEach((doc) => {
        const doctorData = doc.data();
        if (doctorData.name) {
          doctorIdToName[doc.id] = doctorData.name;
        }
      });
      
      // Transform availability to use doctor names as keys
      const mappedAvailability = {};
      for (const [userId, dates] of Object.entries(availability)) {
        const doctorName = doctorIdToName[userId];
        if (doctorName) {
          mappedAvailability[doctorName] = dates;
        }
      }
      
      return mappedAvailability;
    } catch (error) {
      console.error("Error fetching doctor availability:", error);
      throw error;
    }
  },
  
  // NEW: Fetch doctor month completion status from Firebase
  async fetchMonthCompletionStatus() {
    try {
      const completionSnapshot = await getDocs(collection(db, "monthCompletion"));
      const completionStatus = {};
      
      // First, gather the raw completion status data
      completionSnapshot.forEach((doc) => {
        const doctorId = doc.id;
        const doctorCompletion = doc.data();
        completionStatus[doctorId] = doctorCompletion;
      });
      
      // Map doctor IDs to names
      const doctorsSnapshot = await getDocs(collection(db, "doctors"));
      const doctorIdToName = {};
      
      doctorsSnapshot.forEach((doc) => {
        const doctorData = doc.data();
        if (doctorData.name) {
          doctorIdToName[doc.id] = doctorData.name;
        }
      });
      
      // Transform completion status to use doctor names as keys
      const mappedCompletionStatus = {};
      for (const [userId, monthStatus] of Object.entries(completionStatus)) {
        const doctorName = doctorIdToName[userId];
        if (doctorName) {
          mappedCompletionStatus[doctorName] = monthStatus;
        }
      }
      
      return mappedCompletionStatus;
    } catch (error) {
      console.error("Error fetching month completion status:", error);
      throw error;
    }
  },
  
  // NEW: Check if all doctors have completed a specific month
  async checkMonthCompletionForAllDoctors(year, month) {
    try {
      const completionStatus = await this.fetchMonthCompletionStatus();
      const doctors = await this.fetchDoctorPreferences();
      
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const incompleteCount = {
        total: doctors.length,
        completed: 0,
        incomplete: []
      };
      
      // Check if each doctor has completed the specified month
      for (const doctor of doctors) {
        const doctorName = doctor.name;
        const hasCompleted = completionStatus[doctorName] && 
                            completionStatus[doctorName][monthKey] === true;
        
        if (hasCompleted) {
          incompleteCount.completed++;
        } else {
          incompleteCount.incomplete.push(doctorName);
        }
      }
      
      return {
        isComplete: incompleteCount.completed === incompleteCount.total,
        stats: incompleteCount
      };
    } catch (error) {
      console.error("Error checking month completion status:", error);
      throw error;
    }
  },
  
  // Helper to merge doctor data
  mergeDoctors(existingDoctors, cloudDoctors) {
    // Create a map of existing doctors for easy lookup
    const doctorMap = new Map(existingDoctors.map(doc => [doc.name, doc]));
    
    // Update with cloud data or add new doctors
    cloudDoctors.forEach(cloudDoctor => {
      if (doctorMap.has(cloudDoctor.name)) {
        // Update existing doctor with cloud preferences
        const existingDoc = doctorMap.get(cloudDoctor.name);
        doctorMap.set(cloudDoctor.name, {
          ...existingDoc,
          seniority: cloudDoctor.seniority || existingDoc.seniority,
          pref: cloudDoctor.pref || existingDoc.pref
        });
      } else {
        // Add new doctor
        doctorMap.set(cloudDoctor.name, cloudDoctor);
      }
    });
    
    // Convert back to array
    return Array.from(doctorMap.values());
  },
  
  // Helper to merge availability data
  mergeAvailability(existingAvailability, cloudAvailability) {
    const mergedAvailability = { ...existingAvailability };
    
    // Add or update availability from cloud
    for (const [doctorName, dates] of Object.entries(cloudAvailability)) {
      if (!mergedAvailability[doctorName]) {
        mergedAvailability[doctorName] = {};
      }
      
      // Update each date
      for (const [date, status] of Object.entries(dates)) {
        mergedAvailability[doctorName][date] = status;
      }
    }
    
    return mergedAvailability;
  }
};